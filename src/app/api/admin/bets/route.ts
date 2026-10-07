import { betListQuery } from "@/lib/adminQueries";
import { ok, withRoute } from "@/server/api";
import { getAdminBets } from "@/services/bettingService";

/** GET /api/admin/bets — every ticket and casino round, filterable. */
export const GET = withRoute(
  async ({ input }) =>
    ok(
      await getAdminBets({
        ...input,
        status: input.status,
        fromIso: input.from?.toISOString(),
        toIso: input.to?.toISOString(),
      }),
    ),
  { schema: betListQuery, auth: "admin", permission: "bets.read", rateLimit: "admin" },
);
