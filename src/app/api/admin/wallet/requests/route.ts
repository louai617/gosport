import { z } from "zod";
import { ok, withRoute } from "@/server/api";
import { listAdjustmentRequests } from "@/services/walletAdminService";

const query = z.object({ status: z.enum(["pending", "approved", "rejected"]).optional() });

/** GET /api/admin/wallet/requests — adjustments waiting for (or past) a second approval. */
export const GET = withRoute(async ({ input }) => ok(await listAdjustmentRequests(input.status)), {
  schema: query,
  auth: "admin",
  permission: "wallet.read",
  rateLimit: "admin",
});
