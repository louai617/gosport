import { z } from "zod";

import { reasonSchema } from "@/lib/adminValidation";
import { fail, ok, withRoute } from "@/server/api";
import { changeStatus } from "@/services/playerAdminService";

const body = z.object({
  action: z.enum(["suspend", "reactivate"]),
  reason: reasonSchema,
  confirm: z.literal(true, { message: "admin.validation.confirmRequired" }),
});

/** POST /api/admin/managers/:id/status — suspend or reactivate a manager (reason required). */
export const POST = withRoute(
  async ({ input, params }) => {
    const result = await changeStatus(
      params.id!,
      input.action === "suspend" ? "SUSPENDED" : "ACTIVE",
      input.reason,
      "managers.update",
      "manager",
    );
    return result.ok ? ok({ status: input.action }) : fail("conflict", result.errorKey ?? "common.error.unexpected");
  },
  { schema: body, auth: "admin", permission: "managers.update", rateLimit: "admin" },
);
