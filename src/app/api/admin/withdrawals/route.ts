import { ok, withRoute } from "@/server/api";
import { getPendingWithdrawals } from "@/services/walletAdminService";

/** GET /api/admin/withdrawals — pending withdrawal requests, oldest first (a manager sees only their players'). */
export const GET = withRoute(async () => ok(await getPendingWithdrawals()), {
  auth: "admin",
  permission: "withdrawals.process",
  rateLimit: "admin",
});
