import "server-only";

import { prisma, transact, type Tx } from "@/server/db";
import { env } from "@/server/env";
import { requireUser } from "@/server/auth/guard";
import { createHasher, verifyAgainstDummy } from "@/server/auth/password";
import {
  issueSession,
  listActiveSessions,
  readSession,
  revokeAllSessions,
  revokeSession,
  revokeSessionById,
  rotateSession,
} from "@/server/auth/session";
import { roleFromDb } from "@/server/auth/roles";
import { hashToken, newToken } from "@/server/auth/tokens";
import { notifyAdmins, notifyUser } from "@/server/notifications/notify";
import { audit } from "@/server/security/audit";
import { getRequestMeta } from "@/server/security/requestMeta";
import { getSetting } from "@/server/settings/settingsService";
import type { LoginInput } from "@/lib/validation";
import type { SessionUser } from "@/types/user";
import { sessionUserInclude, toSessionUser } from "@/server/auth/sessionUser";

/**
 * Authentication and credential lifecycle.
 *
 * Everything here runs on the server and re-checks what the browser already
 * checked — the form schemas are a courtesy for fast feedback, never the
 * authority. Failure modes are written to be uniform from the outside: an
 * unknown account and a wrong password cost the same time and say the same
 * thing, so sign-in is not an account-enumeration oracle.
 */


export interface AuthFailure {
  ok: false;
  /** i18n key. */
  errorKey: string;
  /** Per-field i18n keys, for forms. */
  fieldErrors?: Record<string, string>;
  retryAfterSeconds?: number;
}

export interface LoginSuccess {
  ok: true;
  user: SessionUser;
}

export type LoginResult = LoginSuccess | AuthFailure;

const INVALID_CREDENTIALS = "auth.error.invalidCredentials";


/* ------------------------------------------------------------ password policy */

/**
 * Server-side policy on top of `passwordSchema`: the operator-configurable
 * extras (minimum length above the baseline, symbol requirement).
 */
export async function passwordPolicyError(password: string): Promise<string | null> {
  const [minLength, requireSymbol] = await Promise.all([
    getSetting("security.passwordMinLength"),
    getSetting("security.passwordRequireSymbol"),
  ]);
  if ([...password].length < minLength) return "auth.validation.passwordPolicyLength";
  if (requireSymbol && !/[^\p{L}\p{N}]/u.test(password)) {
    return "auth.validation.passwordNeedsSymbol";
  }
  return null;
}

export async function maintenanceBlocksPlayers(): Promise<boolean> {
  return getSetting("general.maintenanceMode");
}

/* ---------------------------------------------------------------------- login */

/**
 * Verifies credentials and, on success, issues the session cookie.
 *
 * Order matters:
 *  1. Unknown account → still spend a hash's worth of time, then fail generically.
 *  2. A temporarily locked account is refused *without* checking the password —
 *     checking would tell an attacker whether the guess was right during the lock.
 *  3. Wrong password → count it; at the threshold, lock for a cool-off period.
 *  4. Only after a correct password do account-state messages (suspended, closed)
 *     appear, so they cannot be used to probe which accounts exist.
 */
export async function loginUser(input: LoginInput): Promise<LoginResult> {
  const meta = await getRequestMeta();
  const identifier = input.identifier;
  const now = new Date();

  const user = await prisma.user.findFirst({
    where: { username: identifier },
    include: sessionUserInclude(now),
  });

  const failure = async (
    reason: string,
    actorId: string | null,
    errorKey = INVALID_CREDENTIALS,
    extra: Partial<AuthFailure> = {},
  ): Promise<AuthFailure> => {
    await audit({
      action: "auth.login_failed",
      outcome: "failure",
      actor: actorId ? { id: actorId, role: roleFromDb(user?.role ?? "PLAYER") } : null,
      targetUserId: actorId,
      description: `Failed sign-in (${reason})`,
      metadata: { reason },
    });
    return { ok: false, errorKey, ...extra };
  };

  if (!user) {
    await verifyAgainstDummy(input.password);
    return failure("unknown_account", null);
  }

  if (user.lockedUntil && user.lockedUntil > now) {
    const retryAfterSeconds = Math.ceil((user.lockedUntil.getTime() - now.getTime()) / 1000);
    return failure("temporarily_locked", user.id, "auth.error.temporarilyLocked", {
      retryAfterSeconds,
    });
  }

  const hasher = createHasher();
  const matches = await hasher.verify(user.passwordHash, input.password);

  if (!matches) {
    const [maxFailed, lockoutMinutes] = await Promise.all([
      getSetting("security.maxFailedLogins"),
      getSetting("security.lockoutMinutes"),
    ]);
    const failed = user.failedLoginCount + 1;
    const lock = failed >= maxFailed;

    await prisma.user.update({
      where: { id: user.id },
      data: lock
        ? { failedLoginCount: 0, lockedUntil: new Date(now.getTime() + lockoutMinutes * 60_000) }
        : { failedLoginCount: failed },
    });

    if (lock) {
      await audit({
        action: "auth.account_locked",
        outcome: "blocked",
        actor: null,
        targetUserId: user.id,
        description: `Account temporarily locked for ${lockoutMinutes} min after ${failed} failed sign-ins`,
        metadata: { lockoutMinutes },
      });
      await notifyAdmins({
        kind: "security",
        titleKey: "notify.accountLocked.title",
        bodyKey: "notify.accountLocked.body",
        params: { username: user.username },
        href: user.role === "MANAGER" ? `/admin/managers/${user.id}` : `/admin/players/${user.id}`,
      });
    }
    return failure("wrong_password", user.id);
  }

  // Credentials are correct from here on, so state-specific messages are safe.
  if (user.status === "PENDING") return failure("not_activated", user.id);
  if (user.status === "SUSPENDED") {
    return failure("suspended", user.id, "auth.error.accountSuspended");
  }
  if (user.status === "LOCKED") return failure("locked", user.id, "auth.error.accountLocked");
  if (user.status === "CLOSED") return failure("closed", user.id, "auth.error.accountClosed");

  if (user.role === "PLAYER" && (await maintenanceBlocksPlayers())) {
    return failure("maintenance", user.id, "auth.error.maintenance");
  }

  const rehash = hasher.needsRehash(user.passwordHash)
    ? { passwordHash: await hasher.hash(input.password) }
    : {};

  await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: now, ...rehash },
  });

  const sessionUser = toSessionUser(user);
  await issueSession(sessionUser, {
    ipHash: meta.ipHash,
    userAgent: meta.userAgent,
    remember: input.rememberMe,
  });

  await audit({
    action: "auth.login",
    actor: { id: user.id, role: sessionUser.role },
    targetUserId: user.id,
    targetType: "user",
    targetId: user.id,
    description: `${sessionUser.role[0]!.toUpperCase()}${sessionUser.role.slice(1)} ${user.username} signed in`,
  });

  return { ok: true, user: sessionUser };
}

export async function logoutUser(): Promise<void> {
  const session = await readSession();
  await revokeSession("logout");
  if (session) {
    await audit({
      action: "auth.logout",
      actor: { id: session.user.id, role: session.user.role },
      targetUserId: session.user.id,
      description: `${session.user.username} signed out`,
    });
  }
}

/* ---------------------------------------------------------- change password */

export interface PasswordChangeResult {
  ok: boolean;
  errorKey?: string;
  fieldErrors?: Record<string, string>;
}

export async function changeOwnPassword(input: {
  currentPassword: string;
  newPassword: string;
}): Promise<PasswordChangeResult> {
  const actor = await requireUser({ allowPasswordChangePending: true });
  const session = await readSession();

  const row = await prisma.user.findUniqueOrThrow({
    where: { id: actor.id },
    select: { passwordHash: true },
  });
  const hasher = createHasher();

  if (!(await hasher.verify(row.passwordHash, input.currentPassword))) {
    await audit({
      action: "auth.password_changed",
      outcome: "failure",
      actor,
      targetUserId: actor.id,
      description: "Password change refused: current password incorrect",
    });
    return {
      ok: false,
      errorKey: "auth.error.currentPasswordWrong",
      fieldErrors: { currentPassword: "auth.error.currentPasswordWrong" },
    };
  }

  const policy = await passwordPolicyError(input.newPassword);
  if (policy) return { ok: false, errorKey: policy, fieldErrors: { newPassword: policy } };

  const passwordHash = await hasher.hash(input.newPassword);

  await transact(async (tx) => {
    await tx.user.update({
      where: { id: actor.id },
      data: { passwordHash, mustChangePassword: false, failedLoginCount: 0 },
    });
    await audit({
      tx,
      action: "auth.password_changed",
      actor,
      targetUserId: actor.id,
      description: `${actor.username} changed their password`,
    });
  });

  // A password change is a privilege change: end every other session and give
  // this one a fresh token (session-fixation defence).
  await revokeAllSessions(actor.id, {
    exceptSessionId: session?.record.id,
    reason: "password_changed",
  });
  await rotateSession();

  await notifyUser(actor.id, {
    kind: "security",
    titleKey: "notify.passwordChanged.title",
    bodyKey: "notify.passwordChanged.body",
    href: "/account/security",
  });

  return { ok: true };
}

/* -------------------------------------------------- reset & invitation tokens */

/** Creates a one-time token and returns the raw value — shown/sent exactly once. */
export async function issuePasswordToken(
  tx: Tx,
  options: {
    userId: string;
    purpose: "PASSWORD_RESET" | "INVITATION";
    ttlMs: number;
    createdById?: string | null;
  },
): Promise<string> {
  const token = newToken();
  // Only the newest link works: older unused ones are retired.
  await tx.passwordToken.updateMany({
    where: { userId: options.userId, purpose: options.purpose, usedAt: null },
    data: { usedAt: new Date() },
  });
  await tx.passwordToken.create({
    data: {
      userId: options.userId,
      purpose: options.purpose,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + options.ttlMs),
      createdById: options.createdById ?? null,
    },
  });
  return token;
}

export function passwordLink(token: string): string {
  return `${env.APP_URL.replace(/\/$/, "")}/reset-password?token=${encodeURIComponent(token)}`;
}

export interface TokenInspection {
  valid: boolean;
  purpose?: "PASSWORD_RESET" | "INVITATION";
}

/** Lets the reset page decide whether to show the form without consuming the token. */
export async function inspectPasswordToken(token: string): Promise<TokenInspection> {
  if (token.length < 32 || token.length > 256) return { valid: false };
  const row = await prisma.passwordToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!row || row.usedAt || row.expiresAt <= new Date()) return { valid: false };
  return { valid: true, purpose: row.purpose };
}

export async function completePasswordReset(
  token: string,
  newPassword: string,
): Promise<PasswordChangeResult> {
  const row = await prisma.passwordToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  const now = new Date();
  if (!row || row.usedAt || row.expiresAt <= now) {
    return { ok: false, errorKey: "auth.error.tokenInvalid" };
  }

  const policy = await passwordPolicyError(newPassword);
  if (policy) return { ok: false, errorKey: policy, fieldErrors: { password: policy } };

  const passwordHash = await createHasher().hash(newPassword);

  const consumed = await transact(async (tx) => {
    // Single use, race-safe: only the request that flips `usedAt` proceeds.
    const claim = await tx.passwordToken.updateMany({
      where: { id: row.id, usedAt: null },
      data: { usedAt: now },
    });
    if (claim.count !== 1) return false;

    await tx.user.update({
      where: { id: row.userId },
      data: {
        passwordHash,
        mustChangePassword: false,
        failedLoginCount: 0,
        lockedUntil: null,
        ...(row.user.status === "PENDING" ? { status: "ACTIVE" as const } : {}),
      },
    });
    await audit({
      tx,
      action: "auth.password_reset_completed",
      actor: { id: row.userId, role: roleFromDb(row.user.role) },
      targetUserId: row.userId,
      description:
        row.purpose === "INVITATION"
          ? `${row.user.username} accepted their invitation and set a password`
          : `${row.user.username} reset their password`,
      metadata: { purpose: row.purpose },
    });
    return true;
  });

  if (!consumed) return { ok: false, errorKey: "auth.error.tokenInvalid" };

  // Anyone holding an old session loses it — that is the point of a reset.
  await revokeAllSessions(row.userId, { reason: "password_reset" });
  return { ok: true };
}

/* ------------------------------------------------------------------ sessions */

export interface OwnSession {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  userAgent: string | null;
  current: boolean;
}

/** The signed-in user's live sessions — the account-security screen. */
export async function listOwnSessions(): Promise<OwnSession[]> {
  const actor = await requireUser({ allowPasswordChangePending: true });
  const session = await readSession();
  const rows = await listActiveSessions(actor.id, session?.record.id);
  return rows.map((row) => ({
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    lastSeenAt: row.lastSeenAt.toISOString(),
    userAgent: row.userAgent,
    current: row.current,
  }));
}

export async function revokeOwnSession(sessionId: string): Promise<boolean> {
  const actor = await requireUser({ allowPasswordChangePending: true });
  const done = await revokeSessionById(actor.id, sessionId);
  if (done) {
    await audit({
      action: "auth.session_revoked",
      actor,
      targetUserId: actor.id,
      description: `${actor.username} revoked one of their sessions`,
    });
  }
  return done;
}

export async function revokeOtherSessions(): Promise<number> {
  const actor = await requireUser({ allowPasswordChangePending: true });
  const session = await readSession();
  const revoked = await revokeAllSessions(actor.id, {
    exceptSessionId: session?.record.id,
    reason: "revoked_by_user",
  });
  await audit({
    action: "auth.session_revoked",
    actor,
    targetUserId: actor.id,
    description: `${actor.username} signed out of all other devices`,
    metadata: { revoked },
  });
  return revoked;
}
