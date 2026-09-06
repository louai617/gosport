import { DEMO_SESSION_COOKIE, logout } from "@/services/userService";
import { ok, withRoute } from "@/server/api";

/** POST /api/auth/logout — clears the demo session marker. */
export const POST = withRoute(
  async () => {
    await logout();

    const response = ok({ signedOut: true });
    response.headers.append(
      "set-cookie",
      `${DEMO_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
    );
    return response;
  },
  { audit: "auth.logout" },
);
