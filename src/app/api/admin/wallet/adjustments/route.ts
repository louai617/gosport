import { adjustmentSchema } from "@/lib/adminValidation";
import { fail, ok, withRoute } from "@/server/api";
import { adjustWallet } from "@/services/walletAdminService";

/**
 * POST /api/admin/wallet/adjustments — a manual credit or debit.
 *
 * Goes through the ledger like every other balance change (there is no other
 * way), requires a reason and explicit confirmation, and writes an audit record
 * in the same transaction. Above the configured threshold it is queued for a
 * second administrator instead of being applied.
 */
export const POST = withRoute(
  async ({ input }) => {
    const result = await adjustWallet(input);
    if (!result.ok) return fail("conflict", result.errorKey ?? "common.error.unexpected", { status: 422 });
    return ok(
      {
        pendingApproval: result.pendingApproval ?? false,
        transactionId: result.transactionId,
        reference: result.reference,
        balanceBefore: result.balanceBefore,
        balanceAfter: result.balanceAfter,
      },
      { status: 201 },
    );
  },
  { schema: adjustmentSchema, auth: "admin", permission: "wallet.adjust", rateLimit: "admin" },
);
