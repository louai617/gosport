import { loginSchema } from "@/lib/validation";
import { DEMO_SESSION_COOKIE, login } from "@/services/userService";
import { fail, ok, withRoute } from "@/server/api";

/**
 * POST /api/auth/login
 *
 * DEMO: there is no credential store, so nothing is authenticated. A real
 * implementation verifies an Argon2id hash in constant time, rotates the
 * session on success, and returns the same generic failure for an unknown
 * address as for a wrong password — a different answer per address turns this
 * endpoint into an account-enumeration oracle.
 */
export const POST = withRoute(
  async ({ input }) => {
    const result = await login(input);
    if (!result.ok) {
      return fail("unauthorized", result.errorKey ?? "error.unauthorized", {
        status: 401,
      });
    }

    const response = ok({ signedIn: true, simulated: true });
    response.headers.append(
      "set-cookie",
      [
        `${DEMO_SESSION_COOKIE}=1`,
        "Path=/",
        "HttpOnly",
        "SameSite=Lax",
        process.env.NODE_ENV === "production" ? "Secure" : "",
        `Max-Age=${input.rememberMe ? 60 * 60 * 24 * 7 : 60 * 60 * 8}`,
      ]
        .filter(Boolean)
        .join("; "),
    );
    return response;
  },
  { schema: loginSchema, rateLimit: "login", audit: "auth.login" },
);
