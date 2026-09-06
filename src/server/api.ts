import { randomUUID } from "node:crypto";

import { z } from "zod";

import { toFieldErrors } from "@/lib/validation";
import { AuthError, getSessionUser, requireAdmin, requireUser } from "@/server/auth/guard";
import { env, isDemo } from "@/server/env";
import { audit, type AuditAction } from "@/server/security/audit";
import { CSRF_FIELD, isUnsafeMethod, verifyCsrfToken } from "@/server/security/csrf";
import {
  RATE_LIMITS,
  clientIp,
  rateLimitKey,
  rateLimiter,
  type RateLimitPolicyName,
  type RateLimitResult,
} from "@/server/security/rateLimit";
import { hashIp } from "@/server/security/sanitize";
import type {
  ApiErrorCode,
  ApiFailure,
  ApiFieldError,
  ApiMeta,
  ApiSuccess,
} from "@/types/api";
import type { SessionUser } from "@/types/user";

/**
 * Route-handler toolkit.
 *
 * Every route under `src/app/api/**` is `export const POST = withRoute(...)`.
 * Rate limiting, CSRF, the auth guard, input validation, the audit record and
 * the error envelope are decided here, once, so that a new endpoint cannot
 * accidentally ship without them — the failure mode of per-route middleware is
 * always the route that forgot a line.
 *
 * Two rules the wrapper enforces that are easy to lose sight of:
 *
 * - **The client is never told what went wrong internally.** Every failure
 *   carries an `ApiErrorCode` and an i18n key. A stack trace, a driver message
 *   or a provider response would leak schema and topology, and would be
 *   unreadable in French and Arabic anyway.
 * - **The request body is re-validated server-side, always.** The same schema
 *   runs in the browser for fast feedback; that copy has no authority.
 */

/* ========================================================================== */
/* envelope                                                                   */
/* ========================================================================== */

/**
 * A route may only ever be reached with a request id minted by `middleware.ts`.
 * It is echoed on the response and into the audit record, which is what makes a
 * player's support ticket ("it failed at 21:04") joinable to a log line.
 */
export function requestId(request?: Request): string {
  const inbound = request?.headers.get("x-request-id");
  if (inbound && /^[A-Za-z0-9_-]{8,64}$/.test(inbound)) return inbound;
  return randomUUID();
}

function metaFor(id?: string): ApiMeta {
  return {
    mode: env.APP_MODE,
    requestId: id ?? randomUUID(),
    generatedAt: new Date().toISOString(),
  };
}

export interface EnvelopeInit {
  status?: number;
  headers?: HeadersInit;
  /** Threaded through by `withRoute`; generated on the spot otherwise. */
  requestId?: string;
}

function jsonResponse(body: unknown, status: number, headers?: HeadersInit): Response {
  const merged = new Headers(headers);
  merged.set("content-type", "application/json; charset=utf-8");
  // Balances, open bets and session state must never sit in a shared cache.
  if (!merged.has("cache-control")) merged.set("cache-control", "no-store");
  return new Response(JSON.stringify(body), { status, headers: merged });
}

export function ok<T>(data: T, init: EnvelopeInit = {}): Response {
  const body: ApiSuccess<T> = { ok: true, data, meta: metaFor(init.requestId) };
  return jsonResponse(body, init.status ?? 200, init.headers);
}

const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  bad_request: 400,
  validation_failed: 422,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  demo_mode_blocked: 403,
  compliance_blocked: 403,
  internal_error: 500,
};

export interface FailOptions extends EnvelopeInit {
  fields?: ApiFieldError[];
}

export function fail(
  code: ApiErrorCode,
  messageKey: string,
  options: FailOptions = {},
): Response {
  const body: ApiFailure = {
    ok: false,
    error: { code, messageKey, ...(options.fields ? { fields: options.fields } : {}) },
    meta: metaFor(options.requestId),
  };
  return jsonResponse(body, options.status ?? STATUS_BY_CODE[code], options.headers);
}

/**
 * The refusal every money-moving and wager-placing route returns.
 *
 * Not a 501 and not a silent success: a distinct code the UI can recognise and
 * explain, so the player is told the platform is a simulation rather than shown
 * a generic failure that reads like a bug.
 */
export function demoBlocked(messageKey: string, options: FailOptions = {}): Response {
  return fail("demo_mode_blocked", messageKey, options);
}

/**
 * Thrown by handlers for expected domain failures — an unknown event, a stale
 * price, a duplicate reference. Anything else that escapes a handler is treated
 * as a defect and answered with `internal_error`.
 */
export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly messageKey: string;
  readonly fields?: ApiFieldError[];

  constructor(code: ApiErrorCode, messageKey: string, fields?: ApiFieldError[]) {
    super(`${code}: ${messageKey}`);
    this.name = "ApiError";
    this.code = code;
    this.messageKey = messageKey;
    this.fields = fields;
  }
}

/* ========================================================================== */
/* input                                                                      */
/* ========================================================================== */

/** Methods whose input is the query string rather than a body. */
const QUERY_METHODS = new Set(["GET", "HEAD", "OPTIONS", "DELETE"]);

/** Repeated keys collapse to an array so `?sport=football&sport=tennis` works. */
function searchParamsToObject(params: URLSearchParams): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const key of new Set(params.keys())) {
    const values = params.getAll(key);
    output[key] = values.length > 1 ? values : values[0];
  }
  return output;
}

function formDataToObject(form: FormData): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const key of new Set(form.keys())) {
    // No endpoint accepts uploads; a `File` in the body is discarded rather
    // than coerced to "[object File]" and handed to a schema.
    const values = form.getAll(key).filter((value): value is string => typeof value === "string");
    if (values.length === 0) continue;
    output[key] = values.length > 1 ? values : values[0];
  }
  return output;
}

interface RawInput {
  value: unknown;
  /** Present only for form posts, which carry the CSRF token in the body. */
  csrfFromBody: string | null;
}

async function readRawInput(request: Request): Promise<RawInput> {
  if (QUERY_METHODS.has(request.method.toUpperCase())) {
    const { searchParams } = new URL(request.url);
    return { value: searchParamsToObject(searchParams), csrfFromBody: null };
  }

  const contentType = (request.headers.get("content-type") ?? "").toLowerCase();

  if (contentType.includes("application/json")) {
    const text = await request.text();
    if (text.trim() === "") return { value: {}, csrfFromBody: null };
    try {
      return { value: JSON.parse(text), csrfFromBody: null };
    } catch {
      throw new ApiError("bad_request", "common.error.malformedBody");
    }
  }

  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    const value = formDataToObject(await request.formData());
    const token = value[CSRF_FIELD];
    return { value, csrfFromBody: typeof token === "string" ? token : null };
  }

  return { value: {}, csrfFromBody: null };
}

/* ========================================================================== */
/* wrapper                                                                    */
/* ========================================================================== */

export type RouteAuth = "none" | "user" | "admin";

type InputOf<S> = S extends z.ZodType ? z.output<S> : undefined;
type UserOf<A extends RouteAuth> = A extends "none" ? SessionUser | null : SessionUser;

export interface RouteContext<TInput, A extends RouteAuth> {
  request: Request;
  /** Dynamic segment values, already awaited. */
  params: Record<string, string>;
  /** Parsed and validated. `undefined` when the route declares no schema. */
  input: TInput;
  user: UserOf<A>;
  requestId: string;
  /** Salted digest — the raw address never reaches a handler or a log. */
  ipHash: string;
  userAgent: string | null;
}

export interface RouteOptions<S extends z.ZodType | undefined, A extends RouteAuth> {
  /** Validates the JSON/form body, or the query string on GET and DELETE. */
  schema?: S;
  auth?: A;
  rateLimit?: RateLimitPolicyName;
  /**
   * Defaults to `true` for state-changing methods. Set `false` only for an
   * endpoint authenticated by something other than the session cookie — a
   * provider webhook verified by signature, for instance — never to make a
   * failing form pass.
   */
  csrf?: boolean;
  /** Recorded on success. Failures audit themselves under `security.*`. */
  audit?: AuditAction;
}

export type RouteEntry = (
  request: Request,
  context?: { params?: Promise<Record<string, string | string[] | undefined>> },
) => Promise<Response>;

async function resolveParams(
  context?: { params?: Promise<Record<string, string | string[] | undefined>> },
): Promise<Record<string, string>> {
  const raw = context?.params ? await context.params : undefined;
  if (!raw) return {};

  const output: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string") output[key] = value;
    else if (Array.isArray(value) && typeof value[0] === "string") output[key] = value[0];
  }
  return output;
}

/**
 * Rebuilds the response with the pipeline's headers merged in. A `Headers`
 * object taken from a redirect or a proxied response is immutable, so copying
 * is the only way that always works; the body is passed through untouched.
 */
function withHeaders(response: Response, extra: Record<string, string>): Response {
  const merged = new Headers(response.headers);
  for (const [key, value] of Object.entries(extra)) {
    if (!merged.has(key)) merged.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: merged,
  });
}

function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    "ratelimit-limit": String(result.limit),
    "ratelimit-remaining": String(result.remaining),
    "ratelimit-reset": String(Math.max(0, Math.ceil((result.resetAt - Date.now()) / 1000))),
  };
}

/**
 * Wraps a handler with the full request pipeline.
 *
 * Order is not arbitrary. Rate limiting runs first because it is the cheapest
 * rejection and the one protecting everything behind it. CSRF runs before the
 * auth guard so a forged cross-site request is refused without ever touching
 * the session store. Schema validation runs after auth, so an unauthenticated
 * caller cannot use a validation error as an oracle for what a field expects.
 */
export function withRoute<
  S extends z.ZodType | undefined = undefined,
  A extends RouteAuth = "none",
>(
  handler: (context: RouteContext<InputOf<S>, A>) => Promise<Response> | Response,
  options: RouteOptions<S, A> = {},
): RouteEntry {
  return async function route(request, context): Promise<Response> {
    const id = requestId(request);
    const ipHash = hashIp(clientIp(request));
    const userAgent = request.headers.get("user-agent");
    const method = request.method.toUpperCase();
    const auditBase = { requestId: id, ipHash, userAgent };

    let headers: Record<string, string> = { "x-request-id": id };

    try {
      /* 1 — rate limit */
      if (options.rateLimit) {
        const policy = RATE_LIMITS[options.rateLimit];
        const result = await rateLimiter.check(
          rateLimitKey(request, options.rateLimit),
          policy.limit,
          policy.windowSeconds,
        );
        headers = { ...headers, ...rateLimitHeaders(result) };

        if (!result.allowed) {
          await audit({
            ...auditBase,
            action: "security.rate_limited",
            outcome: "blocked",
            metadata: { scope: options.rateLimit, path: new URL(request.url).pathname },
          });
          return fail("rate_limited", "common.error.rateLimited", {
            requestId: id,
            headers: { ...headers, "retry-after": String(result.retryAfterSeconds) },
          });
        }
      }

      /* 2 — body / query, read once */
      const raw = await readRawInput(request);

      /* 3 — CSRF, defaulting on for anything that can change state */
      const csrfRequired = options.csrf ?? isUnsafeMethod(method);
      if (csrfRequired) {
        const verdict = verifyCsrfToken(request, raw.csrfFromBody);
        if (!verdict.ok) {
          await audit({
            ...auditBase,
            action: "security.csrf_rejected",
            outcome: "blocked",
            metadata: { reason: verdict.reason, path: new URL(request.url).pathname },
          });
          return fail("forbidden", "common.error.csrfRejected", { requestId: id, headers });
        }
      }

      /* 4 — authentication */
      const user: SessionUser | null =
        options.auth === "admin"
          ? await requireAdmin()
          : options.auth === "user"
            ? await requireUser()
            : await getSessionUser();

      /* 5 — validation */
      let input: unknown;
      const schema: z.ZodType | undefined = options.schema;
      if (schema) {
        const parsed = schema.safeParse(raw.value);
        if (!parsed.success) {
          return fail("validation_failed", "common.error.checkFields", {
            requestId: id,
            headers,
            fields: toFieldErrors(parsed.error),
          });
        }
        input = parsed.data;
      }

      /* 6 — handler */
      // The guards above establish exactly what `UserOf<A>` states — `user` is
      // non-null whenever `auth` is not "none" — but the compiler cannot follow
      // that through the generic, hence the assertion.
      const response = await handler({
        request,
        params: await resolveParams(context),
        input: input as InputOf<S>,
        user: user as UserOf<A>,
        requestId: id,
        ipHash,
        userAgent,
      });

      const decorated = withHeaders(response, headers);

      if (options.audit) {
        await audit({
          ...auditBase,
          action: options.audit,
          outcome: decorated.ok ? "success" : "failure",
          actorId: user?.id ?? null,
          actorRole: user?.role ?? null,
          metadata: { status: decorated.status, path: new URL(request.url).pathname },
        });
      }

      return decorated;
    } catch (error) {
      return handleRouteError(error, { id, headers, auditBase, request });
    }
  };
}

interface ErrorContext {
  id: string;
  headers: Record<string, string>;
  auditBase: { requestId: string; ipHash: string; userAgent: string | null };
  request: Request;
}

/**
 * The single place an exception becomes a response.
 *
 * Note what is *not* in any branch: `error.message`. An unexpected error is
 * recorded in full (redacted) in the audit trail and answered with one generic
 * key, because the difference between "no such column" and "no such user" is
 * exactly what an attacker is probing for.
 */
async function handleRouteError(error: unknown, context: ErrorContext): Promise<Response> {
  const { id, headers, auditBase, request } = context;

  if (error instanceof AuthError) {
    await audit({
      ...auditBase,
      action: error.code === "unauthorized" ? "security.unauthorized" : "security.forbidden",
      outcome: "blocked",
      metadata: { path: new URL(request.url).pathname, reason: error.messageKey },
    });
    return fail(error.code, error.messageKey, { requestId: id, headers });
  }

  if (error instanceof ApiError) {
    return fail(error.code, error.messageKey, {
      requestId: id,
      headers,
      fields: error.fields,
    });
  }

  // A schema thrown rather than safe-parsed — a handler validating a second
  // payload, typically a provider response.
  if (error instanceof z.ZodError) {
    return fail("validation_failed", "common.error.checkFields", {
      requestId: id,
      headers,
      fields: toFieldErrors(error),
    });
  }

  await audit({
    ...auditBase,
    action: "system.error",
    outcome: "failure",
    metadata: { path: new URL(request.url).pathname, error },
  });

  return fail("internal_error", "common.error.unexpected", { requestId: id, headers });
}

/** Lets a route say honestly what it is running against. */
export const apiEnvironment = { mode: env.APP_MODE, simulated: isDemo } as const;
