import { ok, withRoute } from "@/server/api";
import { listCreditRequests } from "@/services/creditRequestService";

/** GET /api/admin/credit-requests — requests addressed to the signed-in manager. */
export const GET = withRoute(async () => ok(await listCreditRequests()), {
  auth: "admin",
  permission: "credit.distribute",
  rateLimit: "admin",
});
