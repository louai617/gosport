import { depositSchema } from "@/lib/validation";
import { createDeposit } from "@/services/paymentService";
import { demoBlocked, ok, withRoute } from "@/server/api";

/**
 * POST /api/wallet/deposit
 *
 * Refuses. No payment provider is integrated, and reporting a successful
 * deposit that did not happen is the single most misleading thing this
 * demonstration could do. The validation, auth, CSRF and rate-limit path in
 * front of it is real, so the eventual handler drops in behind it unchanged.
 */
export const POST = withRoute(
  async ({ input }) => {
    const result = await createDeposit(input);
    if (!result.ok) {
      return demoBlocked(result.errorKey ?? "wallet.error.demoModeNoProvider");
    }
    return ok(result);
  },
  {
    schema: depositSchema,
    auth: "user",
    rateLimit: "deposit",
    audit: "wallet.deposit_initiated",
  },
);
