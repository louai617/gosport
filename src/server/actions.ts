import "server-only";

import type { z } from "zod";

import { toFieldErrors } from "@/lib/validation";
import { AuthError, getSessionUser } from "@/server/auth/guard";
import { LedgerError } from "@/server/wallet/ledger";
import { audit } from "@/server/security/audit";
import {
  RATE_LIMITS,
  clientIp,
  identityRateLimitKey,
  limiterFor,
  type RateLimitPolicyName,
} from "@/server/security/rateLimit";
import { hashIp } from "@/server/security/sanitize";
import { headers } from "next/headers";

/**
 * Plumbing shared by server actions.
 *
 * A server action is a public POST endpoint like any route handler: callable by
 * anyone who can craft the request, whatever the UI shows. These helpers give
 * actions the same guarantees `withRoute` gives routes — failures become i18n
 * keys instead of stack traces, a refused caller is recorded, and rate limits
 * apply.
 *
 * CSRF: Next.js compares the request's `Origin` header with the `Host` for every
 * server action and rejects a mismatch before the action runs, so a forged
 * cross-site form post never reaches this code.
 */

export type { ActionState } from "@/lib/actionState";
import type { ActionState } from "@/lib/actionState";

export function zodFieldErrors(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const entry of toFieldErrors(error)) {
    if (!fields[entry.field]) fields[entry.field] = entry.messageKey;
  }
  return fields;
}

/** Form checkbox / switch values. */
export function readBoolean(value: FormDataEntryValue | null): boolean {
  return value === "on" || value === "true";
}

export function text(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value : "";
}

/**
 * Runs an action body and converts anything it throws into an `ActionState`.
 * An `AuthError` is the expected outcome of a caller who should not be here, and
 * is written to the audit trail with who they were.
 */
export async function guarded(name: string, run: () => Promise<ActionState>): Promise<ActionState> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof AuthError) {
      const caller = await getSessionUser().catch(() => null);
      await audit({
        action: error.code === "unauthorized" ? "security.unauthorized" : "security.forbidden",
        outcome: "blocked",
        actor: caller ? { id: caller.id, role: caller.role } : null,
        description: `Blocked action ${name}: ${error.messageKey}`,
        metadata: { action: name, reason: error.messageKey },
      });
      return { ok: false, messageKey: error.messageKey };
    }
    if (error instanceof LedgerError) return { ok: false, messageKey: error.messageKey };

    // Next's redirect()/notFound() work by throwing; they must reach the framework.
    if (isFrameworkSignal(error)) throw error;

    await audit({
      action: "system.error",
      outcome: "failure",
      description: `Unexpected error in action ${name}`,
      metadata: { action: name, error },
    });
    return { ok: false, messageKey: "common.error.unexpected" };
  }
}

function isFrameworkSignal(error: unknown): boolean {
  const digest = (error as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && /^NEXT_(REDIRECT|NOT_FOUND|HTTP_ERROR_FALLBACK)/.test(digest);
}

/** Per-caller (address) and optional per-identifier rate limit for an action. */
export async function limitAction(
  policyName: RateLimitPolicyName,
  identifier?: string,
): Promise<ActionState | null> {
  const policy = RATE_LIMITS[policyName];
  const h = await headers();
  const fakeRequest = new Request("http://localhost", { headers: h });
  const keys = [`${policyName}:${hashIp(clientIp(fakeRequest))}`];
  if (identifier) keys.push(identityRateLimitKey(policyName, identifier));

  for (const key of keys) {
    const result = await limiterFor(policy).check(key, policy.limit, policy.windowSeconds);
    if (!result.allowed) {
      await audit({
        action: "security.rate_limited",
        outcome: "blocked",
        description: `Rate limit hit for ${policyName}`,
        metadata: { scope: policyName },
      });
      return { ok: false, messageKey: "common.error.rateLimited" };
    }
  }
  return null;
}
