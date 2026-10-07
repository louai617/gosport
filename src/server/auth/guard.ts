import "server-only";

import { cache } from "react";

import { can, type Permission } from "@/server/auth/permissions";
import { readSession } from "@/server/auth/session";
import type { ApiErrorCode } from "@/types/api";
import type { SessionUser, UserRole } from "@/types/user";

/**
 * Authorisation guards for route handlers, server actions and services.
 *
 * Each guard either returns the session user or throws. Throwing rather than
 * returning `null` is deliberate: a caller that forgets to check a returned
 * flag still fails closed, and `withRoute` in `src/server/api.ts` maps the
 * thrown error onto the right status and audit event in one place.
 *
 * **These are the authority, not the layouts.** A layout that redirects a
 * non-admin is a convenience; Next renders layouts and pages independently, so
 * the data layer (every service function) calls `requirePermission` itself.
 */

export type AuthErrorCode = Extract<
  ApiErrorCode,
  "unauthorized" | "forbidden" | "compliance_blocked"
>;

const STATUS_BY_CODE: Record<AuthErrorCode, number> = {
  unauthorized: 401,
  forbidden: 403,
  compliance_blocked: 403,
};

export class AuthError extends Error {
  readonly code: AuthErrorCode;
  readonly status: number;
  /** i18n key. The client is never shown a server-generated sentence. */
  readonly messageKey: string;

  constructor(code: AuthErrorCode, messageKey: string) {
    super(`${code}: ${messageKey}`);
    this.name = "AuthError";
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.messageKey = messageKey;
  }
}

/**
 * `cache` dedupes the lookup within one render, so a page and the services it
 * calls share one query. It is a per-request cache — never across requests.
 */
const currentSession = cache(readSession);

/** Non-throwing read, for surfaces that render differently when signed out. */
export async function getSessionUser(): Promise<SessionUser | null> {
  return (await currentSession())?.user ?? null;
}

export async function getSessionId(): Promise<string | null> {
  return (await currentSession())?.record.id ?? null;
}

export interface RequireUserOptions {
  /**
   * An account holding an initial or administrator-set password may do exactly
   * one thing — change it. Only the change-password path passes `true`.
   */
  allowPasswordChangePending?: boolean;
}

export async function requireUser(options: RequireUserOptions = {}): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new AuthError("unauthorized", "auth.error.signInRequired");
  if (user.status === "closed") throw new AuthError("forbidden", "auth.error.accountClosed");
  if (user.mustChangePassword && !options.allowPasswordChangePending) {
    throw new AuthError("forbidden", "auth.error.passwordChangeRequired");
  }
  return user;
}

export async function requireRole(...roles: readonly UserRole[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) throw new AuthError("forbidden", "auth.error.insufficientRole");
  return user;
}

/**
 * The check every administrative service function starts with: authenticated,
 * role known from the database, and the role holds this specific permission.
 */
export async function requirePermission(permission: Permission): Promise<SessionUser> {
  const user = await requireUser();
  if (!can(user.role, "admin.access") || !can(user.role, permission)) {
    throw new AuthError("forbidden", "auth.error.insufficientRole");
  }
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  return requirePermission("admin.access");
}

/**
 * Blocks wagering and deposits for an account that must not play.
 *
 * **Runs server-side on every wagering and deposit path.** Hiding the bet slip
 * is presentation; an excluded player who is determined to gamble will reach
 * the endpoint directly, and a self-exclusion that only exists in the UI is not
 * a control.
 *
 * Withdrawals are intentionally not gated here: an excluded player must always
 * be able to take their balance out.
 */
export function assertCanWager(user: SessionUser): void {
  if (user.status === "self_excluded") {
    throw new AuthError("compliance_blocked", "responsible.error.selfExcluded");
  }
  if (user.status !== "active") {
    throw new AuthError("compliance_blocked", "account.error.restricted");
  }
}
