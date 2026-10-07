import { z } from "zod";
import { fail, ok, withRoute } from "@/server/api";
import { settleBet } from "@/services/bettingService";

const body = z.object({
  results: z.record(z.string().min(1).max(64), z.enum(["WON", "LOST", "VOID"])),
  confirm: z.literal(true, { message: "admin.validation.confirmRequired" }),
});

/** POST /api/admin/bets/:id/settle — settle a ticket from each leg's result; pays once. */
export const POST = withRoute(
  async ({ input, params }) => {
    const result = await settleBet(params.id!, input.results);
    return result.ok
      ? ok({ status: result.status, payout: result.payout })
      : fail("conflict", result.errorKey ?? "common.error.unexpected");
  },
  { schema: body, auth: "admin", permission: "bets.settle", rateLimit: "admin" },
);
