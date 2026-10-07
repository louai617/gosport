import { z } from "zod";
import { fail, ok, withRoute } from "@/server/api";
import { decideAdjustment } from "@/services/walletAdminService";

const body = z.object({
  decision: z.enum(["approve", "reject"]),
  note: z.string().trim().max(300).optional(),
});

/** POST /api/admin/wallet/requests/:id — approve or reject (never your own request). */
export const POST = withRoute(
  async ({ input, params }) => {
    const result = await decideAdjustment(params.id!, input.decision, input.note);
    return result.ok ? ok({ decided: input.decision }) : fail("conflict", result.errorKey ?? "common.error.unexpected");
  },
  { schema: body, auth: "admin", permission: "wallet.adjust.approve", rateLimit: "admin" },
);
