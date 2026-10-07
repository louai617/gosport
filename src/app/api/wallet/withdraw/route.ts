import { withdrawalSchema } from "@/lib/validation";
import { createWithdrawal } from "@/services/paymentService";
import { fail, ok, withRoute } from "@/server/api";

/**
 * POST /api/wallet/withdraw
 *
 * Holds the funds and queues the request for an operator. Nothing is paid out
 * automatically — there is no payout provider. Refused for a restricted account,
 * in maintenance, or when the balance does not cover it.
 */
export const POST = withRoute(
  async ({ input }) => {
    const result = await createWithdrawal(input);
    if (!result.ok) {
      return fail("bad_request", result.errorKey ?? "common.error.unexpected", { status: 422 });
    }
    return ok({ reference: result.intentId, status: result.status }, { status: 201 });
  },
  { schema: withdrawalSchema, auth: "user", rateLimit: "deposit" },
);
