import { creditRequestSchema } from "@/lib/adminValidation";
import { ok, withRoute } from "@/server/api";
import { failFromResult } from "@/server/apiResults";
import { listOwnCreditRequests, requestCredit } from "@/services/creditRequestService";

/** GET /api/credit-requests — the signed-in player's own requests. */
export const GET = withRoute(async () => ok(await listOwnCreditRequests()), {
  auth: "user",
  rateLimit: "api",
});

/** POST /api/credit-requests — ask the player's manager for credit. Moves nothing until approved. */
export const POST = withRoute(
  async ({ input }) => {
    const result = await requestCredit(input);
    return result.ok ? ok({ id: result.id }, { status: 201 }) : failFromResult(result);
  },
  { schema: creditRequestSchema, auth: "user", rateLimit: "deposit" },
);
