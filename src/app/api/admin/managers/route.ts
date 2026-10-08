import { z } from "zod";

import { createManagerSchema } from "@/lib/adminValidation";
import { ok, withRoute } from "@/server/api";
import { failFromResult } from "@/server/apiResults";
import { createManagerAccount } from "@/services/accountService";
import { listManagers } from "@/services/managerService";

const listQuery = z.object({
  search: z.string().trim().max(64).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

/** GET /api/admin/managers — the superadmin's managers, with balances and player counts. */
export const GET = withRoute(async ({ input }) => ok(await listManagers(input)), {
  schema: listQuery,
  auth: "admin",
  permission: "managers.read",
  rateLimit: "admin",
});

/** POST /api/admin/managers — creates a manager with generated credentials, shown once. */
export const POST = withRoute(
  async ({ input }) => {
    const result = await createManagerAccount(input);
    if (!result.ok) return failFromResult(result);
    return ok(
      { managerId: result.accountId, credentials: result.credentials, creditedAmount: result.creditedAmount },
      { status: 201 },
    );
  },
  { schema: createManagerSchema, auth: "admin", permission: "managers.create", rateLimit: "admin" },
);
