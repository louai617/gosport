import { z } from "zod";

import { ok, withRoute } from "@/server/api";
import { failFromResult } from "@/server/apiResults";
import { decideCreditRequest } from "@/services/creditRequestService";

const body = z.object({
  decision: z.enum(["approve", "reject"]),
  note: z.string().trim().max(200).optional(),
});

/** POST /api/admin/credit-requests/:id — approve (sells the credit from the manager's balance) or reject. */
export const POST = withRoute(
  async ({ input, params }) => {
    const result = await decideCreditRequest(params.id!, input.decision, input.note);
    return result.ok ? ok({ decided: input.decision }) : failFromResult(result);
  },
  { schema: body, auth: "admin", permission: "credit.distribute", rateLimit: "admin" },
);
