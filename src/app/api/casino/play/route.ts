import { z } from "zod";
import { fail, ok, withRoute } from "@/server/api";
import {
  playPlinko,
  playRoulette,
  playSlots,
  startBlackjack,
  type BetContext,
} from "@/server/casino/service";
import { resolveCasinoSession, sessionCookie } from "@/server/casino/session";

/**
 * POST /api/casino/play
 *
 * One entry point for every wager. The body says which game and with what
 * parameters; the outcome is drawn here and the ledger is written here. The
 * client never proposes a result.
 *
 * `idempotencyKey` makes a retry safe: the same key returns the original
 * outcome rather than rolling a new one, so a timeout cannot be used to
 * re-roll a losing round.
 */
const bodySchema = z.object({
  game: z.enum(["slots", "plinko", "roulette", "blackjack"]),
  idempotencyKey: z.string().min(8).max(128),
  stake: z.number().optional(),
  rows: z.number().optional(),
  risk: z.enum(["low", "medium", "high"]).optional(),
  bets: z
    .array(z.object({ key: z.string().max(8), amount: z.number() }))
    .max(40)
    .optional(),
});

export const POST = withRoute(
  async ({ input }) => {
    const session = await resolveCasinoSession();
    const context: BetContext = {
      sessionId: session.sessionId,
      openingBalance: session.openingBalance,
      idempotencyKey: input.idempotencyKey,
    };

    const outcome =
      input.game === "slots"
        ? await playSlots(context, input.stake)
        : input.game === "plinko"
          ? await playPlinko(context, input.stake, input.rows, input.risk)
          : input.game === "roulette"
            ? await playRoulette(context, input.bets)
            : await startBlackjack(context, input.stake);

    if (!outcome.ok) {
      return fail("bad_request", outcome.errorKey, { status: 422 });
    }

    const response = ok(outcome);
    if (session.issued) {
      response.headers.append("set-cookie", sessionCookie(session.sessionId));
    }
    return response;
  },
  { schema: bodySchema, rateLimit: "betPlacement", audit: "bet.placed" },
);
