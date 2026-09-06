import { getAccountOverview } from "@/services/userService";
import { ok, withRoute } from "@/server/api";

/** GET /api/account — balance, counts and recent activity for the session. */
export const GET = withRoute(async () => ok(await getAccountOverview()), {
  auth: "user",
  rateLimit: "api",
});
