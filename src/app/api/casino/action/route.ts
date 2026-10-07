import { z } from "zod";
import { fail, ok, withRoute } from "@/server/api";
import { actBlackjack, actCrash, actMines } from "@/server/casino/service";

/**
 * POST /api/casino/action
 *
 * Player decisions on an open round: blackjack hit / stand / double / split,
 * mines reveal / cashout, crash cashout. The round id is looked up *scoped to
 * the caller* (another player's round is indistinguishable from a missing one)
 * and refused once settled, which is what stops a finished round being replayed
 * for a second payout. State changes are optimistically versioned, so two
 * concurrent actions on one round cannot both apply.
 */
const bodySchema = z.object({
  game: z.enum(["blackjack", "mines", "crash"]),
  roundId: z.string().min(8).max(64),
  action: z.string().min(1).max(16),
  tile: z.unknown().optional(),
  idempotencyKey: z.string().min(8).max(128),
});

export const POST = withRoute(
  async ({ input, user }) => {
    const base = { roundId: input.roundId, action: input.action };
    const key = input.idempotencyKey;
    const outcome =
      input.game === "blackjack"
        ? await actBlackjack(user, key, base)
        : input.game === "mines"
          ? await actMines(user, key, { ...base, tile: input.tile })
          : await actCrash(user, key, base);

    if (!outcome.ok) return fail("bad_request", outcome.errorKey, { status: 422 });
    return ok(outcome.data);
  },
  { schema: bodySchema, auth: "user", rateLimit: "betPlacement" },
);
