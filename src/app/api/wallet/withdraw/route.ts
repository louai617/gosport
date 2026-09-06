import { withdrawalSchema } from "@/lib/validation";
import { createWithdrawal } from "@/services/paymentService";
import { demoBlocked, ok, withRoute } from "@/server/api";

/**
 * POST /api/wallet/withdraw
 *
 * Refuses, for the same reason as the deposit route. A real withdrawal path
 * additionally requires a verified account, source-of-funds checks where
 * thresholds apply, and a self-exclusion check before the payout is queued.
 */
export const POST = withRoute(
  async ({ input }) => {
    const result = await createWithdrawal(input);
    if (!result.ok) {
      return demoBlocked(result.errorKey ?? "wallet.error.demoModeNoProvider");
    }
    return ok(result);
  },
  {
    schema: withdrawalSchema,
    auth: "user",
    rateLimit: "deposit",
    audit: "wallet.withdrawal_requested",
  },
);
