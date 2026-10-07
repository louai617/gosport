import { periodQuerySchema } from "@/lib/adminValidation";
import { ok, withRoute } from "@/server/api";
import { getDashboard } from "@/services/analyticsService";

/** GET /api/admin/dashboard?period=last7|…|custom&from=YYYY-MM-DD&to=YYYY-MM-DD */
export const GET = withRoute(async ({ input }) => ok(await getDashboard(input)), {
  schema: periodQuerySchema,
  auth: "admin",
  permission: "dashboard.read",
  rateLimit: "admin",
});
