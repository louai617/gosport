import { restrictionsSchema } from "@/lib/adminValidation";
import { fail, ok, withRoute } from "@/server/api";
import { setPlayerRestrictions } from "@/services/playerAdminService";

/** POST /api/admin/players/:id/restrictions — block wagering and/or withdrawals. */
export const POST = withRoute(
  async ({ input, params }) => {
    const result = await setPlayerRestrictions({ ...input, playerId: params.id! });
    return result.ok ? ok({ saved: true }) : fail("conflict", result.errorKey ?? "common.error.unexpected");
  },
  {
    schema: restrictionsSchema.omit({ playerId: true }),
    auth: "admin",
    permission: "players.update",
    rateLimit: "admin",
  },
);
