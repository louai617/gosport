import { prisma } from "@/server/db";
import { hashIp, sha256Hex } from "@/server/security/sanitize";

/**
 * Request rate limiting.
 *
 * A sportsbook is rate-limited for three different reasons and they need
 * different numbers: credential stuffing against /login, odds scraping against
 * the public feed, and latency arbitrage against bet placement. `RATE_LIMITS`
 * keeps those policies in one place so a route never invents its own.
 */

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  /** Requests left in the current window. Never negative. */
  remaining: number;
  /** Epoch milliseconds at which the oldest hit leaves the window. */
  resetAt: number;
  /** Rounded up, ready for a `Retry-After` header. 0 when allowed. */
  retryAfterSeconds: number;
}

export interface RateLimiter {
  check(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult>;
}

/* -------------------------------------------------------------- policies */

export interface RateLimitPolicy {
  limit: number;
  windowSeconds: number;
  /**
   * `db` for anything guarding sign-in or money: a serverless deployment has no
   * shared memory, so a per-process counter would give an attacker N × the limit.
   * `memory` for cheap, high-volume reads where best-effort is enough.
   */
  store: "db" | "memory";
}

/**
 * Per-route budgets. Deliberately conservative for the credential paths — five
 * failed sign-ins per five minutes per address — because a memory-hard hash
 * makes online guessing slow, not impossible.
 */
export const RATE_LIMITS = {
  login: { limit: 10, windowSeconds: 300, store: "db" },
  register: { limit: 5, windowSeconds: 3600, store: "db" },
  passwordReset: { limit: 5, windowSeconds: 3600, store: "db" },
  password: { limit: 10, windowSeconds: 900, store: "db" },
  betPlacement: { limit: 120, windowSeconds: 60, store: "memory" },
  deposit: { limit: 10, windowSeconds: 3600, store: "db" },
  admin: { limit: 240, windowSeconds: 60, store: "memory" },
  search: { limit: 60, windowSeconds: 60, store: "memory" },
  api: { limit: 240, windowSeconds: 60, store: "memory" },
} as const satisfies Record<string, RateLimitPolicy>;

export type RateLimitPolicyName = keyof typeof RATE_LIMITS;

/* ------------------------------------------------------- in-memory limiter */

/**
 * Bound on distinct keys held at once. Without it, a spray across forged
 * `X-Forwarded-For` values turns the limiter itself into the denial of service.
 */
const MAX_TRACKED_KEYS = 50_000;

/**
 * Sliding-window counter over a list of hit timestamps.
 *
 * Correct where a fixed window is not: a fixed window lets an attacker send
 * `limit` requests at 59s and `limit` more at 61s. Pruning happens on read, so
 * an idle key costs nothing until it is touched again, and a sweep runs on
 * write to reclaim keys nobody asks about any more.
 */
export function createMemoryRateLimiter(): RateLimiter {
  const hits = new Map<string, number[]>();
  let lastSweep = Date.now();

  function sweep(now: number, windowMs: number): void {
    // Cheap amortisation: at most one full pass per window.
    if (now - lastSweep < windowMs) return;
    lastSweep = now;

    for (const [key, timestamps] of hits) {
      const newest = timestamps[timestamps.length - 1];
      if (newest === undefined || now - newest > windowMs) hits.delete(key);
    }
  }

  return {
    async check(key, limit, windowSeconds): Promise<RateLimitResult> {
      const now = Date.now();
      const windowMs = windowSeconds * 1000;
      const cutoff = now - windowMs;

      sweep(now, windowMs);

      const previous = hits.get(key) ?? [];
      const timestamps = previous.filter((at) => at > cutoff);

      if (timestamps.length >= limit) {
        // Refused requests are not recorded: a client hammering a locked bucket
        // must not be able to extend its own lockout indefinitely.
        hits.set(key, timestamps);
        const oldest = timestamps[0] ?? now;
        const resetAt = oldest + windowMs;
        return {
          allowed: false,
          limit,
          remaining: 0,
          resetAt,
          retryAfterSeconds: Math.max(1, Math.ceil((resetAt - now) / 1000)),
        };
      }

      if (!hits.has(key) && hits.size >= MAX_TRACKED_KEYS) {
        // Full and this key is new: fail closed rather than grow without limit.
        return {
          allowed: false,
          limit,
          remaining: 0,
          resetAt: now + windowMs,
          retryAfterSeconds: windowSeconds,
        };
      }

      timestamps.push(now);
      hits.set(key, timestamps);

      const oldest = timestamps[0] ?? now;
      return {
        allowed: true,
        limit,
        remaining: limit - timestamps.length,
        resetAt: oldest + windowMs,
        retryAfterSeconds: 0,
      };
    },
  };
}

/**
 * Process-local limiter.
 *
 * PRODUCTION: this counts per instance, so N instances behind a load balancer
 * allow N x limit. Swap in a Redis implementation of `RateLimiter` — a sorted
 * set per key with `ZREMRANGEBYSCORE` + `ZADD` + `ZCARD` in one Lua script
 * gives the same sliding window atomically across the fleet. Nothing else in
 * the codebase changes: routes only ever see the interface.
 */
export const memoryRateLimiter: RateLimiter = createMemoryRateLimiter();

/* --------------------------------------------------------- database limiter */

/**
 * Fixed-window counter in the database.
 *
 * The increment is a single conditional UPDATE, so two concurrent requests
 * cannot both read "4" and both write "5". When no live window exists the row
 * is (re)created; losing that race to another request just means retrying the
 * increment once.
 */
export function createDatabaseRateLimiter(): RateLimiter {
  return {
    async check(key, limit, windowSeconds): Promise<RateLimitResult> {
      const windowMs = windowSeconds * 1000;

      for (let attempt = 0; attempt < 3; attempt += 1) {
        const now = new Date();

        const bumped = await prisma.rateLimitCounter.updateMany({
          where: { key, expiresAt: { gt: now }, count: { lt: limit } },
          data: { count: { increment: 1 } },
        });

        if (bumped.count === 1) {
          const row = await prisma.rateLimitCounter.findUnique({ where: { key } });
          const count = row?.count ?? 1;
          return {
            allowed: true,
            limit,
            remaining: Math.max(0, limit - count),
            resetAt: row?.expiresAt.getTime() ?? now.getTime() + windowMs,
            retryAfterSeconds: 0,
          };
        }

        const row = await prisma.rateLimitCounter.findUnique({ where: { key } });

        if (row && row.expiresAt > now) {
          // A live window that is already full.
          return {
            allowed: false,
            limit,
            remaining: 0,
            resetAt: row.expiresAt.getTime(),
            retryAfterSeconds: Math.max(1, Math.ceil((row.expiresAt.getTime() - now.getTime()) / 1000)),
          };
        }

        // No live window: start a new one. A concurrent request may beat us to
        // it, in which case the next loop iteration increments theirs.
        try {
          const expiresAt = new Date(now.getTime() + windowMs);
          await prisma.rateLimitCounter.upsert({
            where: { key },
            create: { key, count: 1, windowStart: now, expiresAt },
            update: { count: 1, windowStart: now, expiresAt },
          });
          if (Math.random() < 0.02) {
            // Housekeeping, amortised: drop windows that ended over an hour ago.
            void prisma.rateLimitCounter
              .deleteMany({ where: { expiresAt: { lt: new Date(now.getTime() - 3_600_000) } } })
              .catch(() => undefined);
          }
          return {
            allowed: true,
            limit,
            remaining: limit - 1,
            resetAt: expiresAt.getTime(),
            retryAfterSeconds: 0,
          };
        } catch {
          // lost the race — retry the increment
        }
      }

      // Could not settle after retries: fail closed.
      return {
        allowed: false,
        limit,
        remaining: 0,
        resetAt: Date.now() + windowMs,
        retryAfterSeconds: windowSeconds,
      };
    },
  };
}

export const databaseRateLimiter: RateLimiter = createDatabaseRateLimiter();

export function limiterFor(policy: RateLimitPolicy): RateLimiter {
  return policy.store === "db" ? databaseRateLimiter : memoryRateLimiter;
}

/* ------------------------------------------------------------------- keys */

/**
 * Reads the client IP from the proxy headers.
 *
 * `x-forwarded-for` is a list appended to by every hop and is trivially forged
 * by the client, so only the left-most entry is meaningful and only when the
 * edge is known to overwrite it. A deployment that terminates TLS somewhere
 * else must replace this with that proxy's trusted header.
 */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip")?.trim() ?? "";
}

/**
 * Bucket key for a request.
 *
 * The IP is hashed before it becomes a key so the limiter's memory — and
 * anything that later dumps it for debugging — holds no directly identifying
 * data. The scope prefix keeps a burst of searches from locking a login.
 */
export function rateLimitKey(request: Request, scope: string): string {
  return `${scope}:${hashIp(clientIp(request))}`;
}

/**
 * Key for limits that must follow the account rather than the connection —
 * password reset and deposit velocity, where an attacker rotating IPs is the
 * expected case. The identifier is usually an email, so it is hashed for the
 * same reason the IP is.
 */
export function identityRateLimitKey(scope: string, identifier: string): string {
  return `${scope}:id:${sha256Hex(identifier.trim().toLowerCase()).slice(0, 32)}`;
}
