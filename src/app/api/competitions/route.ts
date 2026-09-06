import { z } from "zod";
import { getCompetitions } from "@/services/sportsService";
import { ok, withRoute } from "@/server/api";

const querySchema = z.object({
  sportId: z.string().optional(),
  countryId: z.string().optional(),
  popular: z.enum(["true", "false"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

/** GET /api/competitions?sportId=&countryId=&popular=&limit= */
export const GET = withRoute(
  async ({ input }) =>
    ok(
      await getCompetitions({
        sportId: input.sportId,
        countryId: input.countryId,
        popular: input.popular === undefined ? undefined : input.popular === "true",
        limit: input.limit,
      }),
    ),
  { schema: querySchema, rateLimit: "api" },
);
