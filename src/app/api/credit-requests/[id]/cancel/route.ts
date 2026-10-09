import { ok, withRoute } from "@/server/api";
import { failFromResult } from "@/server/apiResults";
import { cancelCreditRequest } from "@/services/creditRequestService";

/** POST /api/credit-requests/:id/cancel — withdraw a request that is still pending. */
export const POST = withRoute(
  async ({ params }) => {
    const result = await cancelCreditRequest(params.id!);
    return result.ok ? ok({ cancelled: true }) : failFromResult(result);
  },
  { auth: "user", rateLimit: "api" },
);
