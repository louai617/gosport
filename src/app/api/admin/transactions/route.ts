import { transactionListQuery } from "@/lib/adminQueries";
import { ok, withRoute } from "@/server/api";
import { getAdminTransactions } from "@/services/adminService";

/** GET /api/admin/transactions — the platform-wide ledger, filterable. */
export const GET = withRoute(async ({ input }) => ok(await getAdminTransactions(input)), {
  schema: transactionListQuery,
  auth: "admin",
  permission: "transactions.read",
  rateLimit: "admin",
});
