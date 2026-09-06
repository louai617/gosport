import { z } from "zod";
import { getMarketsForEvent } from "@/services/oddsService";
import { fail, ok, withRoute } from "@/server/api";

const querySchema = z.object({ eventId: z.string().min(1) });

/**
 * GET /api/odds?eventId=…
 *
 * Prices are simulated and non-binding. A licensed operator serves prices from
 * a certified engine and re-prices server-side at acceptance — a client-side
 * quote is never the price a bet is struck at.
 */
export const GET = withRoute(
  async ({ input }) => {
    const markets = await getMarketsForEvent(input.eventId);
    if (markets.length === 0) {
      return fail("not_found", "sportsbook.event.noMarkets", { status: 404 });
    }
    return ok(markets);
  },
  { schema: querySchema, rateLimit: "api" },
);
