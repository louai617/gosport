import { z } from "zod";
import { fail, ok, withRoute } from "@/server/api";
import { RotationBlockedError, fairnessView, rotateSeeds } from "@/server/casino/fairness";

/**
 * GET /api/casino/fairness
 *
 * The commitment the player holds: the SHA-256 of the live server seed, their
 * client seed, the round counter — and the *revealed* server seeds of earlier
 * pairs, so past rounds can be re-derived and checked. The live server seed is
 * never in this response.
 */
export const GET = withRoute(async ({ user }) => ok(await fairnessView(user.id)), {
  auth: "user",
  rateLimit: "api",
});

/**
 * POST /api/casino/fairness
 *
 * Rotates the pair — optionally with a client seed of the player's choosing —
 * which reveals the retired server seed. Refused while a round is open, because
 * revealing a seed mid-round would reveal the rest of that round.
 */
export const POST = withRoute(
  async ({ input, user }) => {
    try {
      return ok(await rotateSeeds(user.id, input.clientSeed));
    } catch (error) {
      if (error instanceof RotationBlockedError) return fail("conflict", error.messageKey);
      throw error;
    }
  },
  {
    schema: z.object({
      clientSeed: z
        .string()
        .trim()
        .min(1)
        .max(64)
        .regex(/^[\w.-]+$/)
        .optional(),
    }),
    auth: "user",
    rateLimit: "api",
  },
);
