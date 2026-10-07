import { z } from "zod";
import { betPlacementSchema } from "@/lib/validation";
import { placeBet, getBets } from "@/services/bettingService";
import { fail, ok, withRoute } from "@/server/api";

const STATUSES = ["pending", "won", "lost", "cancelled", "void", "cashed_out"] as const;

const querySchema = z.object({
  status: z.enum(STATUSES).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  search: z.string().max(64).optional(),
});

/** GET /api/bets — the signed-in player's own tickets and casino rounds. */
export const GET = withRoute(async ({ input }) => ok(await getBets(input)), {
  schema: querySchema,
  auth: "user",
  rateLimit: "api",
});

/**
 * POST /api/bets — places a sportsbook ticket.
 *
 * The body names selections and the prices the player saw; the server prices the
 * ticket from its own book, checks the market is open, applies the player's
 * limits and exclusions, and debits the stake in the same transaction that
 * creates the ticket. `idempotencyKey` makes a retry return the original ticket.
 */
export const POST = withRoute(
  async ({ input }) => {
    const result = await placeBet(input);
    if (!result.ok) {
      return fail(
        result.errorKey === "betting.error.oddsChanged" ? "conflict" : "bad_request",
        result.errorKey,
        { status: result.errorKey === "betting.error.oddsChanged" ? 409 : 422 },
      );
    }
    return ok(
      { tickets: result.tickets, balance: result.balance, replayed: result.replayed },
      { status: result.replayed ? 200 : 201 },
    );
  },
  { schema: betPlacementSchema, auth: "user", rateLimit: "betPlacement" },
);
