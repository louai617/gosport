import { ok, withRoute } from "@/server/api";
import { revokePlayerSessions } from "@/services/playerAdminService";

/** DELETE /api/admin/players/:id/sessions — signs the player out everywhere. */
export const DELETE = withRoute(
  async ({ params }) => {
    const result = await revokePlayerSessions(params.id!);
    return ok({ revoked: result.revoked ?? 0 });
  },
  { auth: "admin", permission: "players.sessions.revoke", rateLimit: "admin", csrf: true },
);
