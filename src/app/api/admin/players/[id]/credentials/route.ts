import { z } from "zod";

import { ok, withRoute } from "@/server/api";
import { failFromResult } from "@/server/apiResults";
import { resetCredentials } from "@/services/accountService";

/**
 * POST /api/admin/players/:id/credentials — replaces the player's password with a
 * newly generated one (returned once), ends their sessions and forces a change.
 */
export const POST = withRoute(
  async ({ params }) => {
    const result = await resetCredentials(params.id!, "player");
    return result.ok ? ok({ credentials: result.credentials }) : failFromResult(result);
  },
  {
    schema: z.object({ confirm: z.literal(true, { message: "admin.validation.confirmRequired" }) }),
    auth: "admin",
    permission: "players.credentials",
    rateLimit: "admin",
  },
);
