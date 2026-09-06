import { randomBytes } from "node:crypto";

import { cookies } from "next/headers";

import { env, isProduction } from "@/server/env";
import { constantTimeEqual } from "@/server/security/sanitize";

/**
 * Cross-site request forgery — double-submit token.
 *
 * `SameSite=Lax` on the session cookie already stops the classic attack: a
 * cross-site `POST` from `evil.example` carries no session, so the request is
 * anonymous and the auth guard refuses it. This module is the second layer,
 * and it exists because the first one has known gaps — a browser that ignores
 * SameSite, a sibling subdomain that can set cookies on the parent domain, and
 * any future endpoint that authenticates by something other than that cookie.
 *
 * The token is generated server-side, stored in a readable cookie, and must be
 * echoed back in the `x-csrf-token` header (or a `csrfToken` form field). A
 * cross-origin page can cause the browser to *send* the cookie but cannot read
 * it, so it cannot produce the matching echo. Everything here fails closed: a
 * missing cookie, a missing echo or a mismatch is a rejection, never a pass.
 */

export const CSRF_HEADER = "x-csrf-token";

/** Field name for progressively-enhanced forms that post without JavaScript. */
export const CSRF_FIELD = "csrfToken";

const TOKEN_BYTES = 32;

/** Methods that cannot change state, and therefore need no token. */
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function isUnsafeMethod(method: string): boolean {
  return !SAFE_METHODS.has(method.toUpperCase());
}

export type CsrfFailureReason =
  | "missing_cookie"
  | "missing_token"
  | "mismatch"
  | "cross_origin";

export type CsrfVerdict = { ok: true } | { ok: false; reason: CsrfFailureReason };

/**
 * The token cookie is deliberately **not** `httpOnly`: the client has to read
 * it to echo it back, which is the whole mechanism. That is an accepted
 * trade-off, not an oversight — an XSS that could read this cookie could
 * equally well issue the request from inside the page, so the token protects
 * against forgery, never against script injection. The CSP in `middleware.ts`
 * is what addresses injection.
 */
function csrfCookieOptions() {
  return {
    httpOnly: false,
    secure: isProduction,
    sameSite: "lax" as const,
    path: "/",
    maxAge: env.SESSION_ABSOLUTE_TTL_SECONDS,
  };
}

/** Issues a fresh token and overwrites any existing one. Route handlers only. */
export async function issueCsrfToken(): Promise<string> {
  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  const store = await cookies();
  store.set(env.CSRF_COOKIE_NAME, token, csrfCookieOptions());
  return token;
}

/**
 * Returns the caller's existing token, minting one only if there is none.
 *
 * Rotating the token on every page render would break the second tab a player
 * has open — a real pattern on a sportsbook, where one tab holds the bet slip
 * while another follows a match. The token is rotated where it matters instead:
 * `rotateSession` issues a new session, and login/logout re-issue this one.
 */
export async function ensureCsrfToken(): Promise<string> {
  const store = await cookies();
  const existing = store.get(env.CSRF_COOKIE_NAME)?.value;
  if (existing && existing.length >= 32) return existing;
  return issueCsrfToken();
}

export async function clearCsrfToken(): Promise<void> {
  const store = await cookies();
  store.delete(env.CSRF_COOKIE_NAME);
}

/**
 * Minimal `Cookie:` header parser.
 *
 * Reading the header directly rather than `cookies()` keeps verification usable
 * from anywhere that holds a `Request` — a route handler, a test, a future edge
 * function — with no framework context to arrange.
 */
function cookieFromRequest(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;

  for (const pair of header.split(";")) {
    const index = pair.indexOf("=");
    if (index === -1) continue;
    if (pair.slice(0, index).trim() !== name) continue;
    return decodeURIComponent(pair.slice(index + 1).trim());
  }
  return null;
}

/**
 * Origin check, applied before the token comparison.
 *
 * `Origin` is set by the browser on every state-changing request and cannot be
 * forged by page script, so a mismatch is conclusive. It is absent on some
 * same-origin navigations, which is why absence is tolerated and the token
 * check still has to pass.
 */
function originMatches(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin || origin === "null") return true;

  try {
    return new URL(origin).origin === new URL(env.APP_URL).origin;
  } catch {
    return false;
  }
}

/**
 * Verifies a state-changing request.
 *
 * `submittedFromBody` exists because the body can only be read once: when
 * `withRoute` has already parsed a form post, it passes the field value here
 * rather than letting this function consume the stream a second time.
 */
export function verifyCsrfToken(
  request: Request,
  submittedFromBody?: string | null,
): CsrfVerdict {
  if (!originMatches(request)) return { ok: false, reason: "cross_origin" };

  const cookieToken = cookieFromRequest(request, env.CSRF_COOKIE_NAME);
  if (!cookieToken) return { ok: false, reason: "missing_cookie" };

  const submitted = request.headers.get(CSRF_HEADER) ?? submittedFromBody ?? null;
  if (!submitted) return { ok: false, reason: "missing_token" };

  if (!constantTimeEqual(cookieToken, submitted)) {
    return { ok: false, reason: "mismatch" };
  }

  return { ok: true };
}
