import { fail, ok, withRoute } from "@/server/api";
import { getPlayerDetail } from "@/services/playerAdminService";

/** GET /api/admin/players/:id — the operator's view of one player (inside their scope). */
export const GET = withRoute(
  async ({ params }) => {
    const player = await getPlayerDetail(params.id!);
    return player ? ok(player) : fail("not_found", "admin.players.error.notFound");
  },
  { auth: "admin", permission: "players.read", rateLimit: "admin" },
);
