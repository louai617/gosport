import { creditSchema } from "@/lib/adminValidation";
import { ok, withRoute } from "@/server/api";
import { failFromResult } from "@/server/apiResults";
import { issueCreditToManager } from "@/services/creditService";

/** POST /api/admin/managers/:id/credit — the superadmin issues credit to a manager. */
export const POST = withRoute(
  async ({ input, params }) => {
    const result = await issueCreditToManager({ ...input, accountId: params.id! });
    return result.ok
      ? ok({ reference: result.reference, recipientBalance: result.recipientBalance })
      : failFromResult(result);
  },
  {
    schema: creditSchema.omit({ accountId: true }),
    auth: "admin",
    permission: "credit.issue",
    rateLimit: "deposit",
  },
);
