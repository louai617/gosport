import { ok, withRoute } from "@/server/api";
import { getPlayerWalletSummary } from "@/services/walletAdminService";

/** GET /api/admin/players/:id/wallet — balance, totals by type and ledger integrity. */
export const GET = withRoute(
  async ({ params }) => ok(await getPlayerWalletSummary(params.id!)),
  { auth: "admin", permission: "wallet.read", rateLimit: "admin" },
);
