import { z } from "zod";
import { ok, withRoute } from "@/server/api";
import { getRecentActivity } from "@/services/analyticsService";

const query = z.object({ limit: z.coerce.number().int().min(1).max(100).optional() });

/** GET /api/admin/activity — the latest sign-ups, sign-ins, wagers and account changes. */
export const GET = withRoute(async ({ input }) => ok(await getRecentActivity(input.limit)), {
  schema: query,
  auth: "admin",
  permission: "dashboard.read",
  rateLimit: "admin",
});
