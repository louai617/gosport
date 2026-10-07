import { updatePlayerSchema } from "@/lib/adminValidation";
import { fail, ok, withRoute } from "@/server/api";
import { getPlayerDetail, updatePlayer } from "@/services/playerAdminService";

/** GET /api/admin/players/:id — the operator's view of one player. */
export const GET = withRoute(
  async ({ params }) => {
    const player = await getPlayerDetail(params.id!);
    return player ? ok(player) : fail("not_found", "admin.players.error.notFound");
  },
  { auth: "admin", permission: "players.read", rateLimit: "admin" },
);

/** PATCH /api/admin/players/:id — edits permitted fields; a reason is required and audited. */
export const PATCH = withRoute(
  async ({ input, params }) => {
    const result = await updatePlayer({ ...input, playerId: params.id! });
    if (!result.ok) {
      return fail("validation_failed", result.errorKey ?? "common.error.checkFields", {
        fields: Object.entries(result.fieldErrors ?? {}).map(([field, messageKey]) => ({ field, messageKey })),
      });
    }
    return ok({ updated: true });
  },
  {
    schema: updatePlayerSchema.omit({ playerId: true }),
    auth: "admin",
    permission: "players.update",
    rateLimit: "admin",
  },
);
