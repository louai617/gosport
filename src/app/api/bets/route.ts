import { z } from "zod";
import { getBets } from "@/services/userService";
import { ok, withRoute } from "@/server/api";

const STATUSES = ["pending", "won", "lost", "cancelled", "void", "cashed_out"] as const;

const querySchema = z.object({
  status: z.enum(STATUSES).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  search: z.string().max(64).optional(),
});

/** GET /api/bets — the session's ticket history. */
export const GET = withRoute(async ({ input }) => ok(await getBets(input)), {
  schema: querySchema,
  auth: "user",
  rateLimit: "api",
});
