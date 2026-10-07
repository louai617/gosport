import "server-only";

import { JURISDICTION } from "@/config/app.config";
import { getRequestLocale } from "@/i18n/server";
import { isUniqueViolation, prisma, transact, type Tx } from "@/server/db";
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
import { hashToken, newToken } from "@/server/auth/tokens";
import { ensureWallet } from "@/server/wallet/ledger";
import { notifyAdmins, notifyUser } from "@/server/notifications/notify";
import { sendSecureLink } from "@/server/notifications/transport";
import { audit } from "@/server/security/audit";
import { hashEmail } from "@/server/security/redact";
import { getRequestMeta } from "@/server/security/requestMeta";
import { getSetting } from "@/server/settings/settingsService";
import type { LoginInput, RegisterInput } from "@/lib/validation";
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

const RESET_TTL_MS = 30 * 60 * 1000;
export const INVITATION_TTL_MS = 72 * 3600 * 1000;

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

/* ------------------------------------------------------------------- register */

function declaredAge(isoDate: string, now = new Date()): number {
  const [year, month, day] = isoDate.split("-").map(Number);
  if (!year || !month || !day) return Number.NaN;
  const beforeBirthday =
    now.getUTCMonth() + 1 < month || (now.getUTCMonth() + 1 === month && now.getUTCDate() < day);
  return now.getUTCFullYear() - year - (beforeBirthday ? 1 : 0);
}

export async function maintenanceBlocksPlayers(): Promise<boolean> {
  return getSetting("general.maintenanceMode");
}

/**
 * Creates a player. Registration is a **self-declaration**: nothing here
 * verifies identity or age, and the account stays `kycStatus: NOT_STARTED` until
 * an operator (or, in a licensed deployment, a verification provider) says
 * otherwise.
 */
export async function registerPlayer(
  input: RegisterInput,
): Promise<LoginResult> {
  if (!(await getSetting("players.registrationEnabled"))) {
    return { ok: false, errorKey: "auth.error.registrationClosed" };
  }
  if (await maintenanceBlocksPlayers()) {
    return { ok: false, errorKey: "auth.error.maintenance" };
  }

  const age = declaredAge(input.dateOfBirth);
  if (!Number.isFinite(age) || age < JURISDICTION.legalAge) {
    return { ok: false, errorKey: "auth.validation.dobUnderage", fieldErrors: { dateOfBirth: "auth.validation.dobUnderage" } };
  }

  const policy = await passwordPolicyError(input.password);
  if (policy) return { ok: false, errorKey: policy, fieldErrors: { password: policy } };

  const taken = await prisma.user.findFirst({
    where: { OR: [{ email: input.email }, { username: input.username }] },
    select: { email: true, username: true },
  });
  if (taken) {
    const fieldErrors: Record<string, string> = {};
    if (taken.email === input.email) fieldErrors.email = "auth.validation.emailTaken";
    if (taken.username === input.username) fieldErrors.username = "auth.validation.usernameTaken";
    return { ok: false, errorKey: "common.error.checkFields", fieldErrors };
  }

  const passwordHash = await createHasher().hash(input.password);
  const locale = await getRequestLocale();
  const now = new Date();

  try {
    const user = await transact(async (tx) => {
      const created = await tx.user.create({
        data: {
          username: input.username,
          email: input.email,
          phone: input.phone,
          passwordHash,
          role: "PLAYER",
          status: "ACTIVE",
          profile: {
            create: {
              displayName: `${input.firstName} ${input.lastName.charAt(0)}.`,
              firstName: input.firstName,
              lastName: input.lastName,
              dateOfBirth: new Date(`${input.dateOfBirth}T00:00:00.000Z`),
              countryCode: input.country,
              locale,
              ageDeclaredAt: now,
              termsAcceptedAt: now,
              marketingOptIn: input.marketingOptIn ?? false,
            },
          },
        },
        include: sessionUserInclude(now),
      });
      await ensureWallet(tx, created.id);
      await audit({
        tx,
        action: "auth.register",
        actor: { id: created.id, role: "player" },
        targetUserId: created.id,
        targetType: "user",
        targetId: created.id,
        description: `Player ${created.username} registered`,
      });
      await notifyAdmins({
        tx,
        kind: "new_player",
        titleKey: "notify.newPlayer.title",
        bodyKey: "notify.newPlayer.body",
        params: { username: created.username },
        href: `/admin/players/${created.id}`,
      });
      return created;
    });

    return { ok: true, user: toSessionUser(user) };
  } catch (error) {
    if (isUniqueViolation(error)) {
      // Lost a race with a concurrent registration for the same address/handle.
      return { ok: false, errorKey: "auth.error.registrationConflict" };
    }
    throw error;
  }
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
  const isEmail = identifier.includes("@");
  const now = new Date();

  const user = await prisma.user.findFirst({
    where: isEmail ? { email: identifier } : { username: identifier },
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
      actor: actorId ? { id: actorId, role: user?.role === "ADMIN" ? "admin" : "player" } : null,
      targetUserId: actorId,
      description: `Failed sign-in (${reason})`,
      metadata: { reason, identifier: isEmail ? hashEmail(identifier) : "username-supplied" },
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
        href: `/admin/players/${user.id}`,
      });
    }
    return failure("wrong_password", user.id);
  }

  // Credentials are correct from here on, so state-specific messages are safe.
  if (user.status === "PENDING") return failure("invitation_pending", user.id);
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
    description: `${user.role === "ADMIN" ? "Administrator" : "Player"} ${user.username} signed in`,
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

/**
 * Starts a self-service reset. The response never depends on whether the
 * address is known — a different answer per address is an enumeration oracle.
 * Delivery goes through the configured transport; with none configured (the
 * production default here) nothing is sent and an administrator can issue the
 * link instead.
 */
export async function requestPasswordReset(email: string): Promise<{ ok: true }> {
  const user = await prisma.user.findUnique({ where: { email } });

  if (user && (user.status === "ACTIVE" || user.status === "SELF_EXCLUDED")) {
    const token = await transact((tx) =>
      issuePasswordToken(tx, { userId: user.id, purpose: "PASSWORD_RESET", ttlMs: RESET_TTL_MS }),
    );
    const delivery = await sendSecureLink({
      kind: "password_reset",
      to: { email: user.email, phone: user.phone },
      link: passwordLink(token),
    });
    await audit({
      action: "auth.password_reset_requested",
      actor: null,
      targetUserId: user.id,
      description: delivery.delivered
        ? "Password reset link issued and handed to the delivery transport"
        : "Password reset link issued but NO delivery transport is configured",
      metadata: { delivered: delivery.delivered, transport: delivery.transport },
    });
  } else {
    await audit({
      action: "auth.password_reset_requested",
      actor: null,
      description: "Password reset requested for an unknown or ineligible address",
      metadata: { email: hashEmail(email) },
    });
  }

  return { ok: true };
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
        // Following a link sent to the address proves control of it.
        emailVerifiedAt: row.user.emailVerifiedAt ?? now,
        // Accepting an invitation activates the account.
        ...(row.user.status === "PENDING" ? { status: "ACTIVE" as const } : {}),
      },
    });
    await audit({
      tx,
      action: "auth.password_reset_completed",
      actor: { id: row.userId, role: row.user.role === "ADMIN" ? "admin" : "player" },
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
