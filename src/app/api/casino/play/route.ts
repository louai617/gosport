import { z } from "zod";
import { fail, ok, withRoute } from "@/server/api";
import {
  playDice,
  playLimbo,
  playPlinko,
  playRoulette,
  playSlots,
  startBlackjack,
  startCrash,
  startMines,
} from "@/server/casino/service";

/**
 * POST /api/casino/play
 *
 * One entry point for every wager. The body says which game and with what
 * parameters; the outcome is drawn here, from the player's committed seed, and
 * the ledger is written here, in one transaction. The client never proposes a
 * result, and a stake is validated, limit-checked and debited server-side.
 *
 * `idempotencyKey` makes a retry safe: the same key returns the original
 * outcome rather than rolling a new one, so a timeout cannot be used to re-roll
 * a losing round — and cannot charge twice.
 *
 * Shapes are checked loosely here; each game validates its own parameters
 * strictly (the service is the authority, not this schema).
 */
const bodySchema = z.object({
  game: z.enum(["slots", "plinko", "roulette", "blackjack", "dice", "limbo", "crash", "mines"]),
  idempotencyKey: z.string().min(8).max(128),
  stake: z.unknown().optional(),
  rows: z.unknown().optional(),
  risk: z.unknown().optional(),
  bets: z.unknown().optional(),
  target: z.unknown().optional(),
  direction: z.unknown().optional(),
  mineCount: z.unknown().optional(),
  autoCashOut: z.unknown().optional(),
});

export const POST = withRoute(
  async ({ input, user }) => {
    const key = input.idempotencyKey;

    const outcome =
      input.game === "slots"
        ? await playSlots(user, key, input)
        : input.game === "plinko"
          ? await playPlinko(user, key, input)
          : input.game === "roulette"
            ? await playRoulette(user, key, input)
            : input.game === "blackjack"
              ? await startBlackjack(user, key, input)
              : input.game === "dice"
                ? await playDice(user, key, input)
                : input.game === "limbo"
                  ? await playLimbo(user, key, input)
                  : input.game === "crash"
                    ? await startCrash(user, key, input)
                    : await startMines(user, key, input);

    if (!outcome.ok) return fail("bad_request", outcome.errorKey, { status: 422 });
    return ok(outcome.data);
  },
  { schema: bodySchema, auth: "user", rateLimit: "betPlacement" },
);
