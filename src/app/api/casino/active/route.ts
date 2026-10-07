import { z } from "zod";
import { ok, withRoute } from "@/server/api";
import { getActiveRound } from "@/server/casino/service";

/**
 * GET /api/casino/active?game=blackjack|mines|crash[&roundId=…]
 *
 * The caller's open round for that game, or `null`. This is what makes a page
 * reload resume a hand instead of stranding the stake. The view is the same
 * redacted one a play response carries — never the shoe, the mines or the bust point.
 */
export const GET = withRoute(
  async ({ input, user }) => ok((await getActiveRound(user, input.game, input.roundId))?.envelope ?? null),
  {
    schema: z.object({
      game: z.enum(["blackjack", "mines", "crash"]),
      roundId: z.string().min(8).max(64).optional(),
    }),
    auth: "user",
    rateLimit: "api",
  },
);
