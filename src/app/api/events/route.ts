import { z } from "zod";
import { getEvents } from "@/services/sportsService";
import { ok, withRoute } from "@/server/api";

const STATUSES = ["scheduled", "live", "finished", "cancelled", "postponed"] as const;
const SPORT_KEYS = [
  "football",
  "basketball",
  "tennis",
  "handball",
  "volleyball",
  "rugby",
  "boxing",
  "formula1",
] as const;

const querySchema = z.object({
  sportId: z.string().optional(),
  sportKey: z.enum(SPORT_KEYS).optional(),
  competitionId: z.string().optional(),
  countryId: z.string().optional(),
  status: z.enum(STATUSES).optional(),
  featured: z.enum(["true", "false"]).optional(),
  fromIso: z.iso.datetime().optional(),
  toIso: z.iso.datetime().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

/** GET /api/events — the fixture list, filtered. */
export const GET = withRoute(
  async ({ input }) =>
    ok(
      await getEvents({
        ...input,
        featured: input.featured === undefined ? undefined : input.featured === "true",
      }),
    ),
  { schema: querySchema, rateLimit: "api" },
);
