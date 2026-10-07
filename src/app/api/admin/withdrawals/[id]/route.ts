import { z } from "zod";
import { fail, ok, withRoute } from "@/server/api";
import { processWithdrawal } from "@/services/walletAdminService";

const body = z.object({
  decision: z.enum(["approve", "reject"]),
  note: z.string().trim().max(300).optional(),
});

/** POST /api/admin/withdrawals/:id — approve a payout, or reject it and return the funds. */
export const POST = withRoute(
  async ({ input, params }) => {
    const result = await processWithdrawal(params.id!, input.decision, input.note);
    return result.ok ? ok({ decided: input.decision }) : fail("conflict", result.errorKey ?? "common.error.unexpected");
  },
  { schema: body, auth: "admin", permission: "withdrawals.process", rateLimit: "admin" },
);
