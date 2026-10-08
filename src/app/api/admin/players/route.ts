import { createPlayerSchema } from "@/lib/adminValidation";
import { playerListQuery } from "@/lib/adminQueries";
import { ok, withRoute } from "@/server/api";
import { failFromResult } from "@/server/apiResults";
import { createPlayerAccount } from "@/services/accountService";
import { listPlayers } from "@/services/playerAdminService";

/** GET /api/admin/players — search, filter, sort and page the caller's players. */
export const GET = withRoute(async ({ input }) => ok(await listPlayers(input)), {
  schema: playerListQuery,
  auth: "admin",
  permission: "players.read",
  rateLimit: "admin",
});

/**
 * POST /api/admin/players — creates a player with a **generated** username and
 * password, returned once in this response. A manager's players belong to that
 * manager; `initialCredit` (managers only) is sold from the manager's balance.
 */
export const POST = withRoute(
  async ({ input }) => {
    const result = await createPlayerAccount(input);
    if (!result.ok) return failFromResult(result);
    return ok(
      { playerId: result.accountId, credentials: result.credentials, creditedAmount: result.creditedAmount },
      { status: 201 },
    );
  },
  { schema: createPlayerSchema, auth: "admin", permission: "players.create", rateLimit: "admin" },
);
