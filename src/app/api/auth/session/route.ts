import { ok, withRoute } from "@/server/api";
import { ensureCsrfToken } from "@/server/security/csrf";

/**
 * GET /api/auth/session
 *
 * Who is signed in (or `null`), plus a CSRF token for the write endpoints. Never
 * returns anything beyond the narrow `SessionUser`.
 */
export const GET = withRoute(
  async ({ user }) => {
    const csrfToken = await ensureCsrfToken();
    return ok({
      user: user
        ? {
            id: user.id,
            username: user.username,
            displayName: user.displayName,
            role: user.role,
            status: user.status,
            mustChangePassword: user.mustChangePassword,
          }
        : null,
      csrfToken,
    });
  },
  { rateLimit: "api" },
);
