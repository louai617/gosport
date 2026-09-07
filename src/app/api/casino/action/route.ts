import { z } from "zod";
import { fail, ok, withRoute } from "@/server/api";
import { actBlackjack, type BetContext } from "@/server/casino/service";
import { resolveCasinoSession, sessionCookie } from "@/server/casino/session";

/**
 * POST /api/casino/action
 *
 * Player decisions on an open blackjack hand. The round id is validated
 * against the caller's own session and refused once settled, which is what
 * stops a finished hand being replayed for a second payout.
 */
const bodySchema = z.object({
  roundId: z.string().min(8).max(64),
  action: z.enum(["hit", "stand", "double", "split"]),
  idempotencyKey: z.string().min(8).max(128),
});

export const POST = withRoute(
  async ({ input }) => {
    const session = await resolveCasinoSession();
    const context: BetContext = {
      sessionId: session.sessionId,
      openingBalance: session.openingBalance,
      idempotencyKey: input.idempotencyKey,
    };

    const outcome = await actBlackjack(context, input.roundId, input.action);
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
