import { randomBytes, randomUUID } from "node:crypto";

import { cookies } from "next/headers";

import { env, isDemo, isProduction } from "@/server/env";
import { sha256Hex } from "@/server/security/sanitize";
import type { SessionUser } from "@/types/user";

/**
 * Sessions.
 *
 * Opaque token in a cookie, session record on the server. Not a JWT: a
 * sportsbook has to be able to end a session *now* — a self-exclusion, a
 * support-initiated lock, a suspected account takeover — and a self-contained
 * token that is valid until it expires cannot be ended, only denied by a
 * revocation list, which is a session table with extra steps.
 *
 * What is stored is the SHA-256 of the token, never the token. A session table
 * that leaks is then a list of digests: it identifies which accounts had
 * sessions, and nothing an attacker can present as one. The token is 32 random
 * bytes, so a plain unsalted digest is sufficient — there is no low-entropy
 * space to pre-compute.
 *
 * ── DEMO ──────────────────────────────────────────────────────────────────
 * The store below is an in-process `Map`. Sessions vanish on restart and are
 * not shared between instances, which is correct for a build with no account
 * database. `setSessionStore` is the seam a Prisma-backed store slots into.
 * ──────────────────────────────────────────────────────────────────────────
 */

const TOKEN_BYTES = 32;

export interface SessionRecord {
  id: string;
  userId: string;
  /** SHA-256 of the cookie token, hex. The token itself is never persisted. */
  tokenHash: string;
  issuedAt: number;
  lastSeenAt: number;
  /** Idle deadline — extended while the session is used. */
  idleExpiresAt: number;
  /** Absolute deadline — fixed at issue, never extended. */
  absoluteExpiresAt: number;
  /** Salted digest from `hashIp`; the raw address is not kept. */
  ipHash: string | null;
  userAgent: string | null;
  revokedAt: number | null;
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
  /**
   * Carried across a rotation. Rotating is a security measure, not a reason to
   * grant the account another full absolute lifetime.
   */
  absoluteExpiresAt?: number;
}

/**
 * Persistence boundary.
 *
 * `findByTokenHash` returns the *current* user row, not a snapshot taken at
 * login. That distinction is a control, not an optimisation: a self-exclusion
 * or a role revocation has to take effect on the player's next request, not the
 * next time they happen to log in.
 */
export interface SessionStore {
  create(record: SessionRecord, user: SessionUser): Promise<void>;
  findByTokenHash(tokenHash: string): Promise<ActiveSession | null>;
  touch(id: string, lastSeenAt: number, idleExpiresAt: number): Promise<void>;
  revoke(id: string): Promise<void>;
  revokeAllForUser(userId: string): Promise<void>;
}

/**
 * DEMO ONLY. Single-process, non-durable, unbounded-by-design because the demo
 * has a handful of simulated accounts and no way to create more.
 */
function createMemorySessionStore(): SessionStore {
  const records = new Map<string, { record: SessionRecord; user: SessionUser }>();

  return {
    async create(record, user) {
      records.set(record.tokenHash, { record, user });
    },
    async findByTokenHash(tokenHash) {
      const entry = records.get(tokenHash);
      return entry ? { record: { ...entry.record }, user: { ...entry.user } } : null;
    },
    async touch(id, lastSeenAt, idleExpiresAt) {
      for (const entry of records.values()) {
        if (entry.record.id !== id) continue;
        entry.record.lastSeenAt = lastSeenAt;
        entry.record.idleExpiresAt = idleExpiresAt;
        return;
      }
    },
    async revoke(id) {
      for (const [hash, entry] of records) {
        if (entry.record.id === id) records.delete(hash);
      }
    },
    async revokeAllForUser(userId) {
      for (const [hash, entry] of records) {
        if (entry.record.userId === userId) records.delete(hash);
      }
    },
  };
}

/**
 * The dev server re-evaluates modules on hot reload; without stashing the store
 * on `globalThis` every edit would silently sign the developer out.
 */
const globalForSessions = globalThis as typeof globalThis & {
  sportgoSessionStore?: SessionStore;
};

let store: SessionStore =
  globalForSessions.sportgoSessionStore ?? createMemorySessionStore();

if (!isProduction) globalForSessions.sportgoSessionStore = store;

export function setSessionStore(next: SessionStore): void {
  store = next;
}

/* ------------------------------------------------------------------ cookie */

/**
 * `sameSite: "lax"` rather than `strict`: a player following a link from a
 * results site or a shared bet slip must land already signed in, and `lax`
 * still withholds the cookie from cross-site `POST`s, which is the case that
 * matters. `secure` is off in development only because the dev server is
 * plain http on localhost.
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

function tokenHashOf(token: string): string {
  return sha256Hex(token);
}

/** Remaining cookie lifetime: the idle window, clipped by the absolute one. */
function cookieLifetime(now: number, absoluteExpiresAt: number): number {
  const idle = env.SESSION_TTL_SECONDS;
  const untilAbsolute = Math.floor((absoluteExpiresAt - now) / 1000);
  return Math.min(idle, Math.max(0, untilAbsolute));
}

/* ------------------------------------------------------------------- issue */

/**
 * Creates a session and sets the cookie.
 *
 * Route handlers and server actions only — a server component cannot write a
 * cookie, and calling this from one throws inside Next rather than silently
 * doing nothing.
 */
export async function issueSession(
  user: SessionUser,
  context: SessionContext = {},
): Promise<IssuedSession> {
  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  const now = Date.now();
  const absoluteExpiresAt =
    context.absoluteExpiresAt ?? now + env.SESSION_ABSOLUTE_TTL_SECONDS * 1000;

  const record: SessionRecord = {
    id: randomUUID(),
    userId: user.id,
    tokenHash: tokenHashOf(token),
    issuedAt: now,
    lastSeenAt: now,
    idleExpiresAt: Math.min(now + env.SESSION_TTL_SECONDS * 1000, absoluteExpiresAt),
    absoluteExpiresAt,
    ipHash: context.ipHash ?? null,
    userAgent: context.userAgent ?? null,
    revokedAt: null,
  };

  await store.create(record, user);

  const jar = await cookies();
  jar.set(
    env.SESSION_COOKIE_NAME,
    token,
    sessionCookieOptions(cookieLifetime(now, record.absoluteExpiresAt)),
  );

  return { token, record, user };
}

/* -------------------------------------------------------------------- read */

/**
 * Writing back on every request would put a database round-trip on the hot path
 * of a page that is otherwise pure reads. Half the idle window is a long way
 * from the deadline and cheap enough.
 */
const TOUCH_THRESHOLD = 0.5;

/**
 * Resolves the current session, or `null`.
 *
 * Two independent deadlines are enforced here. **Idle** expiry ends a session
 * that has gone quiet — the shared-computer case. **Absolute** expiry ends it
 * regardless of activity, so a stolen token has a bounded life however busy the
 * thief keeps it. Neither is extended by the other.
 *
 * Safe to call from a server component: it only reads the cookie, and the
 * refresh below is skipped when the response is no longer writable.
 */
export async function readSession(): Promise<ActiveSession | null> {
  const jar = await cookies();
  const token = jar.get(env.SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const found = await store.findByTokenHash(tokenHashOf(token));
  if (!found) return null;

  const { record, user } = found;
  const now = Date.now();

  if (record.revokedAt !== null) return null;
  if (now >= record.absoluteExpiresAt || now >= record.idleExpiresAt) {
    await store.revoke(record.id);
    return null;
  }

  const elapsed = now - record.lastSeenAt;
  const idleWindow = env.SESSION_TTL_SECONDS * 1000;
  if (elapsed > idleWindow * TOUCH_THRESHOLD) {
    const idleExpiresAt = Math.min(now + idleWindow, record.absoluteExpiresAt);
    await store.touch(record.id, now, idleExpiresAt);
    record.lastSeenAt = now;
    record.idleExpiresAt = idleExpiresAt;

    // A server component may not mutate cookies; the sliding cookie is a
    // convenience and its absence only costs the user an earlier sign-out.
    try {
      jar.set(
        env.SESSION_COOKIE_NAME,
        token,
        sessionCookieOptions(cookieLifetime(now, record.absoluteExpiresAt)),
      );
    } catch {
      /* read-only context */
    }
  }

  return { record, user };
}

/* ------------------------------------------------------------------ revoke */

/** Ends the current session and clears the cookie. Idempotent. */
export async function revokeSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(env.SESSION_COOKIE_NAME)?.value;

  if (token) {
    const found = await store.findByTokenHash(tokenHashOf(token));
    if (found) await store.revoke(found.record.id);
  }

  jar.delete(env.SESSION_COOKIE_NAME);
}

/** Ends every session for one account — password change, support lock, fraud. */
export async function revokeAllSessions(userId: string): Promise<void> {
  await store.revokeAllForUser(userId);
}

/**
 * Replaces the current session token with a new one, keeping the account.
 *
 * Must be called on every privilege change: immediately after a successful
 * login, after a password or email change, after enabling or disabling 2FA, and
 * after any role change. A token that was valid before the change and stays
 * valid after it is session fixation — an attacker who plants a known token in
 * the victim's browser pre-authentication inherits the authenticated session
 * the moment the victim signs in.
 *
 * The absolute deadline is deliberately inherited rather than reset: rotating
 * is not a reason to extend how long the session may live.
 */
export async function rotateSession(user?: SessionUser): Promise<IssuedSession | null> {
  const current = await readSession();
  if (!current) return null;

  await store.revoke(current.record.id);

  return issueSession(user ?? current.user, {
    ipHash: current.record.ipHash,
    userAgent: current.record.userAgent,
    absoluteExpiresAt: current.record.absoluteExpiresAt,
  });
}

/** Surfaced to the account "active sessions" screen so it can label the truth. */
export const sessionEnvironment = {
  mode: env.APP_MODE,
  durable: !isDemo,
  idleTimeoutSeconds: env.SESSION_TTL_SECONDS,
  absoluteTimeoutSeconds: env.SESSION_ABSOLUTE_TTL_SECONDS,
} as const;
