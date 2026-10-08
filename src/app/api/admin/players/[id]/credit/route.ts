import { creditSchema } from "@/lib/adminValidation";
import { ok, withRoute } from "@/server/api";
import { failFromResult } from "@/server/apiResults";
import { sellCreditToPlayer } from "@/services/creditService";

/**
 * POST /api/admin/players/:id/credit — a manager sells credit to one of their own
 * players, out of the manager's balance, in a single transaction.
 */
export const POST = withRoute(
  async ({ input, params }) => {
    const result = await sellCreditToPlayer({ ...input, accountId: params.id! });
    return result.ok
      ? ok({ reference: result.reference, senderBalance: result.senderBalance, recipientBalance: result.recipientBalance })
      : failFromResult(result);
  },
  {
    schema: creditSchema.omit({ accountId: true }),
    auth: "admin",
    permission: "credit.distribute",
    rateLimit: "deposit",
  },
);
