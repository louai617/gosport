import { verificationSchema } from "@/lib/adminValidation";
import { fail, ok, withRoute } from "@/server/api";
import { setPlayerVerification } from "@/services/playerAdminService";

/** POST /api/admin/players/:id/verification — record a manual verification decision. */
export const POST = withRoute(
  async ({ input, params }) => {
    const result = await setPlayerVerification({ ...input, playerId: params.id! });
    return result.ok ? ok({ saved: true }) : fail("conflict", result.errorKey ?? "common.error.unexpected");
  },
  {
    schema: verificationSchema.omit({ playerId: true }),
    auth: "admin",
    permission: "players.update",
    rateLimit: "admin",
  },
);
