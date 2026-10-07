import { depositSchema } from "@/lib/validation";
import { createDeposit } from "@/services/paymentService";
import { demoBlocked, ok, withRoute } from "@/server/api";

/**
 * POST /api/wallet/deposit
 *
 * Refuses. No payment provider is integrated, and reporting a deposit that
 * moved no real money would be the single most misleading thing this platform
 * could do. Credit is added by an operator (admin console → player → wallet).
 * The auth, CSRF, validation and rate-limit path in front of this is real, so a
 * provider-backed handler drops in behind it unchanged.
 */
export const POST = withRoute(
  async ({ input }) => {
    const result = await createDeposit(input);
    if (!result.ok) {
      return demoBlocked(result.errorKey ?? "wallet.error.demoModeNoProvider");
    }
    return ok(result);
  },
  { schema: depositSchema, auth: "user", rateLimit: "deposit" },
);
