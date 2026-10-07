import { z } from "zod";
import { ok, withRoute } from "@/server/api";
import { getHistory } from "@/server/casino/service";

/** GET /api/casino/history — the caller's own settled rounds, newest first. */
export const GET = withRoute(
  async ({ input, user }) => ok(await getHistory(user, input.game, input.limit ?? 30)),
  {
    schema: z.object({
      game: z.string().max(24).optional(),
      limit: z.coerce.number().int().min(1).max(100).optional(),
    }),
    auth: "user",
    rateLimit: "api",
  },
);
