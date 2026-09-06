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
}

/**
 * Numbers chosen so a real person never notices and a script always does.
 *
 * `login` is the tightest because it protects a credential, and it is keyed by
 * IP *and* by account elsewhere in the flow — an attacker spraying one password
 * across many accounts is invisible to a per-account counter alone.
 */
export const RATE_LIMITS = {
  login: { limit: 5, windowSeconds: 300 },
  register: { limit: 5, windowSeconds: 3600 },
  passwordReset: { limit: 3, windowSeconds: 3600 },
  /** Generous per minute, because a slip can be placed line by line. */
  betPlacement: { limit: 30, windowSeconds: 60 },
  deposit: { limit: 10, windowSeconds: 3600 },
  /** Search is cheap per call but the classic scraping surface. */
  search: { limit: 60, windowSeconds: 60 },
  /** Catch-all for read endpoints. */
  api: { limit: 120, windowSeconds: 60 },
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
export const rateLimiter: RateLimiter = createMemoryRateLimiter();

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
