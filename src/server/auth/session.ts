import "server-only";

import { randomUUID } from "node:crypto";

import { cookies } from "next/headers";

import { prisma } from "@/server/db";
import { env, isProduction } from "@/server/env";
import { hashToken, newToken } from "@/server/auth/tokens";
import {
  canHoldSession,
  sessionUserInclude,
  toSessionUser,
} from "@/server/auth/sessionUser";
import type { SessionUser } from "@/types/user";

/**
 * Sessions.
 *
 * An opaque token in a cookie and a row in the `Session` table. Not a JWT: a
 * financial platform has to be able to end a session *now* — a suspension, a
 * self-exclusion, a suspected takeover — and a self-contained token that is
 * valid until it expires cannot be ended, only denied via a revocation list,
 * which is a session table with extra steps.
 *
 * What is stored is the HMAC of the token (`hashToken`), never the token.
 *
 * `readSession` returns the *current* user row, not a snapshot taken at login:
 * a suspension or a role change takes effect on the very next request.
 */

export interface SessionRecord {
  id: string;
  userId: string;
  createdAt: Date;
  lastSeenAt: Date;
  idleExpiresAt: Date;
  absoluteExpiresAt: Date;
  ipHash: string | null;
  userAgent: string | null;
}

export interface ActiveSession {
  record: SessionRecord;
  user: SessionUser;
}

export interface IssuedSession extends ActiveSession {
  /** Returned once, at issue. Only the caller setting the cookie sees it. */
  token: string;
}

export interface SessionContext {
  ipHash?: string | null;
  userAgent?: string | null;
  /** Player-only "stay signed in": longer idle and absolute windows. */
  remember?: boolean;
  /** Carried across a rotation — rotating is not a reason to extend the life. */
  absoluteExpiresAt?: Date;
}

const REMEMBER_IDLE_SECONDS = 24 * 3600;
const REMEMBER_ABSOLUTE_SECONDS = 7 * 24 * 3600;

function lifetimes(role: SessionUser["role"], remember: boolean) {
  if (role === "admin") {
    return {
      idle: env.ADMIN_SESSION_TTL_SECONDS,
      absolute: env.ADMIN_SESSION_ABSOLUTE_TTL_SECONDS,
    };
  }
  if (remember) {
    return { idle: REMEMBER_IDLE_SECONDS, absolute: REMEMBER_ABSOLUTE_SECONDS };
  }
  return { idle: env.SESSION_TTL_SECONDS, absolute: env.SESSION_ABSOLUTE_TTL_SECONDS };
}

/* ------------------------------------------------------------------ cookie */

/**
 * `sameSite: "lax"` rather than `strict`: a player following a link from a
 * results site must land already signed in, and `lax` still withholds the
 * cookie from cross-site `POST`s, which is the case that matters.
 */
function sessionCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax" as const,
    path: "/",
    maxAge: Math.max(0, Math.floor(maxAgeSeconds)),
  };
}

function cookieLifetime(now: number, idleSeconds: number, absoluteExpiresAt: Date): number {
  const untilAbsolute = Math.floor((absoluteExpiresAt.getTime() - now) / 1000);
  return Math.min(idleSeconds, Math.max(0, untilAbsolute));
}

/* ------------------------------------------------------------------- issue */

/**
 * Creates a session and sets the cookie. Route handlers and server actions
 * only — a server component cannot write a cookie.
 */
export async function issueSession(
  user: Pick<SessionUser, "id" | "role">,
  context: SessionContext = {},
): Promise<{ token: string; sessionId: string }> {
  const token = newToken();
  const now = Date.now();
  const { idle, absolute } = lifetimes(user.role, context.remember ?? false);
  const absoluteExpiresAt = context.absoluteExpiresAt ?? new Date(now + absolute * 1000);
  const idleExpiresAt = new Date(Math.min(now + idle * 1000, absoluteExpiresAt.getTime()));

  const session = await prisma.session.create({
    data: {
      id: randomUUID(),
      userId: user.id,
      tokenHash: hashToken(token),
      idleExpiresAt,
      absoluteExpiresAt,
      ipHash: context.ipHash ?? null,
      userAgent: context.userAgent?.slice(0, 300) ?? null,
    },
    select: { id: true },
  });

  const jar = await cookies();
  jar.set(env.SESSION_COOKIE_NAME, token, sessionCookieOptions(cookieLifetime(now, idle, absoluteExpiresAt)));

  return { token, sessionId: session.id };
}

/* -------------------------------------------------------------------- read */

/** Half the idle window is far from the deadline and keeps the hot path write-free. */
const TOUCH_THRESHOLD = 0.5;

/**
 * Resolves the current session, or `null`.
 *
 * **Idle** expiry ends a session that has gone quiet — the shared-computer
 * case. **Absolute** expiry ends it regardless of activity, so a stolen token
 * has a bounded life however busy the thief keeps it.
 *
 * Safe to call from a server component: it only reads the cookie, and the
 * sliding refresh is skipped when the response is not writable.
 */
export async function readSession(): Promise<ActiveSession | null> {
  const jar = await cookies();
  const token = jar.get(env.SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const now = new Date();
  const row = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { include: sessionUserInclude(now) } },
  });
  if (!row || row.revokedAt) return null;

  const user = toSessionUser(row.user);

  if (
    now >= row.absoluteExpiresAt ||
    now >= row.idleExpiresAt ||
    !canHoldSession(user.status)
  ) {
    await prisma.session
      .update({
        where: { id: row.id },
        data: { revokedAt: now, revokedReason: "expired_or_blocked" },
      })
      .catch(() => undefined);
    return null;
  }

  const idleSeconds = lifetimes(user.role, false).idle;
  const elapsed = now.getTime() - row.lastSeenAt.getTime();
  const longestIdle = row.idleExpiresAt.getTime() - row.lastSeenAt.getTime();
  const window = Math.max(idleSeconds * 1000, longestIdle);

  if (elapsed > window * TOUCH_THRESHOLD) {
    const idleExpiresAt = new Date(
      Math.min(now.getTime() + window, row.absoluteExpiresAt.getTime()),
    );
    await prisma.session
      .update({ where: { id: row.id }, data: { lastSeenAt: now, idleExpiresAt } })
      .catch(() => undefined);
    row.lastSeenAt = now;
    row.idleExpiresAt = idleExpiresAt;

    // A server component may not mutate cookies; the sliding cookie is a
    // convenience and its absence only costs the user an earlier sign-out.
    try {
      jar.set(
        env.SESSION_COOKIE_NAME,
        token,
        sessionCookieOptions(cookieLifetime(now.getTime(), window / 1000, row.absoluteExpiresAt)),
      );
    } catch {
      /* read-only context */
    }
  }

  return {
    record: {
      id: row.id,
      userId: row.userId,
      createdAt: row.createdAt,
      lastSeenAt: row.lastSeenAt,
      idleExpiresAt: row.idleExpiresAt,
      absoluteExpiresAt: row.absoluteExpiresAt,
      ipHash: row.ipHash,
      userAgent: row.userAgent,
    },
    user,
  };
}

/* ------------------------------------------------------------------ revoke */

/** Ends the current session and clears the cookie. Idempotent. */
export async function revokeSession(reason = "logout"): Promise<void> {
  const jar = await cookies();
  const token = jar.get(env.SESSION_COOKIE_NAME)?.value;

  if (token) {
    await prisma.session.updateMany({
      where: { tokenHash: hashToken(token), revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  jar.delete(env.SESSION_COOKIE_NAME);
}

/**
 * Ends every session for one account — password change, suspension, fraud.
 * `exceptSessionId` keeps the caller signed in when they are the one acting.
 */
export async function revokeAllSessions(
  userId: string,
  options: { exceptSessionId?: string; reason?: string } = {},
): Promise<number> {
  const result = await prisma.session.updateMany({
    where: {
      userId,
      revokedAt: null,
      ...(options.exceptSessionId ? { NOT: { id: options.exceptSessionId } } : {}),
    },
    data: { revokedAt: new Date(), revokedReason: options.reason ?? "revoked" },
  });
  return result.count;
}

/** Revokes one session, but only if it belongs to `userId`. */
export async function revokeSessionById(
  userId: string,
  sessionId: string,
  reason = "revoked_by_user",
): Promise<boolean> {
  const result = await prisma.session.updateMany({
    where: { id: sessionId, userId, revokedAt: null },
    data: { revokedAt: new Date(), revokedReason: reason },
  });
  return result.count > 0;
}

/**
 * Replaces the current session token with a new one, keeping the account.
 *
 * Must be called on every privilege change — after login, after a password
 * change. A token that was valid before the change and stays valid after it is
 * session fixation. The absolute deadline is inherited, not reset.
 */
export async function rotateSession(): Promise<boolean> {
  const current = await readSession();
  if (!current) return false;

  await prisma.session.update({
    where: { id: current.record.id },
    data: { revokedAt: new Date(), revokedReason: "rotated" },
  });

  await issueSession(current.user, {
    ipHash: current.record.ipHash,
    userAgent: current.record.userAgent,
    absoluteExpiresAt: current.record.absoluteExpiresAt,
  });
  return true;
}

export interface SessionSummary {
  id: string;
  createdAt: Date;
  lastSeenAt: Date;
  userAgent: string | null;
  current: boolean;
}

/** Active sessions for the account-security screen. */
export async function listActiveSessions(
  userId: string,
  currentSessionId?: string,
): Promise<SessionSummary[]> {
  const now = new Date();
  const rows = await prisma.session.findMany({
    where: {
      userId,
      revokedAt: null,
      absoluteExpiresAt: { gt: now },
      idleExpiresAt: { gt: now },
    },
    orderBy: { lastSeenAt: "desc" },
    take: 50,
    select: { id: true, createdAt: true, lastSeenAt: true, userAgent: true },
  });
  return rows.map((row) => ({ ...row, current: row.id === currentSessionId }));
}

export const sessionEnvironment = {
  mode: env.APP_MODE,
  durable: true,
  idleTimeoutSeconds: env.SESSION_TTL_SECONDS,
  absoluteTimeoutSeconds: env.SESSION_ABSOLUTE_TTL_SECONDS,
  adminIdleTimeoutSeconds: env.ADMIN_SESSION_TTL_SECONDS,
  adminAbsoluteTimeoutSeconds: env.ADMIN_SESSION_ABSOLUTE_TTL_SECONDS,
} as const;
