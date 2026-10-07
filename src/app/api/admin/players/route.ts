import { createPlayerSchema } from "@/lib/adminValidation";
import { playerListQuery } from "@/lib/adminQueries";
import { fail, ok, withRoute } from "@/server/api";
import { createPlayer, listPlayers } from "@/services/playerAdminService";

/** GET /api/admin/players — search, filter, sort and page the player table. */
export const GET = withRoute(async ({ input }) => ok(await listPlayers(input)), {
  schema: playerListQuery,
  auth: "admin",
  permission: "players.read",
  rateLimit: "admin",
});

/**
 * POST /api/admin/players — creates a player. Returns a one-time invitation
 * link (never a password) when the credential mode is "invitation".
 */
export const POST = withRoute(
  async ({ input }) => {
    const result = await createPlayer(input);
    if (!result.ok) {
      return fail("validation_failed", result.errorKey ?? "common.error.checkFields", {
        fields: Object.entries(result.fieldErrors ?? {}).map(([field, messageKey]) => ({ field, messageKey })),
      });
    }
    return ok(
      { playerId: result.playerId, username: result.username, invitationLink: result.invitationLink },
      { status: 201 },
    );
  },
  { schema: createPlayerSchema, auth: "admin", permission: "players.create", rateLimit: "admin" },
);
