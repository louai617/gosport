import { z } from "zod";
import { getResults } from "@/services/sportsService";
import { ok, withRoute } from "@/server/api";

const querySchema = z.object({
  sportId: z.string().optional(),
  competitionId: z.string().optional(),
  dateIso: z.string().optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

/** GET /api/results — completed fixtures, paginated. */
export const GET = withRoute(async ({ input }) => ok(await getResults(input)), {
  schema: querySchema,
  rateLimit: "api",
});
