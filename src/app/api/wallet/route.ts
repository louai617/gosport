import { getWallet } from "@/services/paymentService";
import { ok, withRoute } from "@/server/api";

/** GET /api/wallet — the sandbox balance. Not money. */
export const GET = withRoute(async () => ok(await getWallet()), {
  auth: "user",
  rateLimit: "api",
});
