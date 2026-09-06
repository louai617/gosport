import { z } from "zod";
import { getSports } from "@/services/sportsService";
import { ok, withRoute } from "@/server/api";

/** GET /api/sports — the sport catalogue with live and upcoming counts. */
export const GET = withRoute(async () => ok(await getSports()), {
  rateLimit: "api",
  schema: z.object({}).passthrough().optional(),
});
