import { ok, withRoute } from "@/server/api";
import { logoutUser } from "@/services/authService";

/** POST /api/auth/logout — revokes the session server-side and clears the cookie. */
export const POST = withRoute(
  async () => {
    await logoutUser();
    return ok({ signedOut: true });
  },
  { csrf: true },
);
