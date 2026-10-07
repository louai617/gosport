import { z } from "zod";
import { ok, withRoute } from "@/server/api";
import { searchAdmin } from "@/services/searchService";

const query = z.object({ q: z.string().trim().max(64).default("") });

/** GET /api/admin/search?q= — players, transactions and tickets the caller may read. */
export const GET = withRoute(async ({ input }) => ok(await searchAdmin(input.q)), {
  schema: query,
  auth: "admin",
  permission: "search.use",
  rateLimit: "search",
});
