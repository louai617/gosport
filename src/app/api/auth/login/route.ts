import { loginSchema } from "@/lib/validation";
import { fail, ok, withRoute } from "@/server/api";
import { identityRateLimitKey, limiterFor, RATE_LIMITS } from "@/server/security/rateLimit";
import { loginUser } from "@/services/authService";

/**
 * POST /api/auth/login
 *
 * Verifies an Argon2id hash in constant time, rotates into a fresh session, and
 * answers an unknown account exactly as it answers a wrong password. Throttled
 * per address (by `withRoute`) and per identifier (below), so one account cannot
 * be ground down from many addresses either.
 */
export const POST = withRoute(
  async ({ input }) => {
    const policy = RATE_LIMITS.login;
    const perAccount = await limiterFor(policy).check(
      identityRateLimitKey("login", input.identifier),
      policy.limit,
      policy.windowSeconds,
    );
    if (!perAccount.allowed) {
      return fail("rate_limited", "common.error.rateLimited", {
        headers: { "retry-after": String(perAccount.retryAfterSeconds) },
      });
    }

    const result = await loginUser(input);
    if (!result.ok) {
      return fail("unauthorized", result.errorKey, {
        status: 401,
        headers: result.retryAfterSeconds
          ? { "retry-after": String(result.retryAfterSeconds) }
          : undefined,
      });
    }

    return ok({
      user: {
        id: result.user.id,
        username: result.user.username,
        role: result.user.role,
        mustChangePassword: result.user.mustChangePassword,
      },
    });
  },
  { schema: loginSchema, rateLimit: "login" },
);
