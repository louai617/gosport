import { readSession } from "@/server/auth/session";
import type { ApiErrorCode } from "@/types/api";
import type { SessionUser, UserRole } from "@/types/user";

/**
 * Authorisation guards for route handlers and server components.
 *
 * Each guard either returns the session user or throws. Throwing rather than
 * returning `null` is deliberate: a route that forgets to check a returned flag
 * still fails closed, and `withRoute` in `src/server/api.ts` maps the thrown
 * error onto the right status and audit event in one place.
 */

/** Subset of `ApiErrorCode` a guard can produce. */
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

/** Non-throwing read, for surfaces that render differently when signed out. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await readSession();
  return session?.user ?? null;
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new AuthError("unauthorized", "auth.error.signInRequired");
  if (user.status === "closed") {
    throw new AuthError("forbidden", "auth.error.accountClosed");
  }
  return user;
}

/**
 * Role check.
 *
 * `admin` is not implicitly granted the other roles: an operator console that
 * lets an administrator act as a trader without that being an explicit,
 * separately-audited grant is how insider odds manipulation stops being
 * traceable. List every role a route accepts.
 */
export async function requireRole(...roles: readonly UserRole[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) {
    throw new AuthError("forbidden", "auth.error.insufficientRole");
  }
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  return requireRole("admin");
}

/**
 * Blocks the wagering and deposit paths for an account that must not be able to
 * play.
 *
 * **This has to run server-side on every wagering and deposit endpoint.** Hiding
 * the bet slip and greying out the deposit button is presentation; a
 * self-excluded player who is determined to gamble will reach the endpoint
 * directly, and a self-exclusion that only exists in the UI is not a control —
 * it is the failure a regulator asks about first.
 *
 * Withdrawals are intentionally *not* gated here: an excluded player must
 * always be able to take their balance out. Blocking that would turn a
 * protective measure into a reason to reverse it.
 */
export function assertNotSelfExcluded(user: SessionUser): void {
  if (user.status === "self_excluded") {
    throw new AuthError("compliance_blocked", "responsible.error.selfExcluded");
  }
  if (user.status === "closed") {
    throw new AuthError("compliance_blocked", "auth.error.accountClosed");
  }
  // `restricted` covers a support hold, a pending AML review and an active
  // cooling-off. All three mean "no new liability on this account".
  if (user.status === "restricted") {
    throw new AuthError("compliance_blocked", "account.error.restricted");
  }
}

/**
 * The KYC gate.
 *
 * Never satisfied in this build — `kycStatus` is always `not_started`, because
 * there is no verification provider and inventing one would be worse than
 * having none. Live deployment must call this before the first real wager and
 * before the first real deposit, not merely before the first withdrawal:
 * verifying only on the way out lets an unverified, possibly underage account
 * play first and be checked afterwards.
 */
export function assertIdentityVerified(user: SessionUser): void {
  if (user.kycStatus !== "verified") {
    throw new AuthError("compliance_blocked", "account.error.verificationRequired");
  }
}
