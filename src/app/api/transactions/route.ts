import { z } from "zod";
import { getTransactions } from "@/services/paymentService";
import { ok, withRoute } from "@/server/api";

const KINDS = [
  "deposit",
  "withdrawal",
  "bet_stake",
  "bet_payout",
  "bonus",
  "refund",
  "adjustment",
] as const;

const STATUSES = [
  "pending",
  "processing",
  "completed",
  "failed",
  "cancelled",
  "reversed",
] as const;

const querySchema = z.object({
  kind: z.enum(KINDS).optional(),
  status: z.enum(STATUSES).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

/** GET /api/transactions — the sandbox ledger for the session. */
export const GET = withRoute(async ({ input }) => ok(await getTransactions(input)), {
  schema: querySchema,
  auth: "user",
  rateLimit: "api",
});
