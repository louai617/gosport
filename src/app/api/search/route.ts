import { z } from "zod";
import { search } from "@/services/sportsService";
import { ok, withRoute } from "@/server/api";

const querySchema = z.object({
  q: z.string().min(2).max(64),
  limit: z.coerce.number().int().min(1).max(40).optional(),
});

/** GET /api/search?q=…&limit= — teams, competitions, sports and fixtures. */
export const GET = withRoute(
  async ({ input }) => ok(await search(input.q, input.limit ?? 10)),
  // Cheap per call, but this is the classic scraping surface.
  { schema: querySchema, rateLimit: "search" },
);
