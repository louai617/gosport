import { z } from "zod";
import { ok, withRoute } from "@/server/api";
import { readHistory } from "@/server/casino/service";
import { resolveCasinoSession } from "@/server/casino/session";

/** GET /api/casino/history — settled rounds for the caller's session. */
export const GET = withRoute(
  async ({ input }) => {
    const session = await resolveCasinoSession();
    return ok(
      readHistory(session.sessionId, session.openingBalance, input.limit ?? 50),
    );
  },
  {
    schema: z.object({ limit: z.coerce.number().int().min(1).max(200).optional() }),
    rateLimit: "api",
  },
);
