import { z } from "zod";
import { getTransactions } from "@/services/paymentService";
import { ok, withRoute } from "@/server/api";

const KINDS = [
  "deposit",
  "withdrawal",
  "bet",
  "win",
  "refund",
  "bonus",
  "admin_credit",
  "admin_debit",
  "adjustment",
] as const;

const STATUSES = ["pending", "completed", "failed", "cancelled", "reversed"] as const;

const querySchema = z.object({
  kind: z.enum(KINDS).optional(),
  status: z.enum(STATUSES).optional(),
  search: z.string().max(64).optional(),
  fromIso: z.iso.datetime().optional(),
  toIso: z.iso.datetime().optional(),
  sort: z.enum(["createdAt", "amount", "type", "status", "balanceAfter"]).optional(),
  direction: z.enum(["asc", "desc"]).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

/** GET /api/transactions — the signed-in player's own ledger, and only theirs. */
export const GET = withRoute(async ({ input }) => ok(await getTransactions(input)), {
  schema: querySchema,
  auth: "user",
  rateLimit: "api",
});
