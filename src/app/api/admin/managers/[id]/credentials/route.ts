import { z } from "zod";

import { ok, withRoute } from "@/server/api";
import { failFromResult } from "@/server/apiResults";
import { resetCredentials } from "@/services/accountService";

/** POST /api/admin/managers/:id/credentials — generates a new password for a manager (shown once). */
export const POST = withRoute(
  async ({ params }) => {
    const result = await resetCredentials(params.id!, "manager");
    return result.ok ? ok({ credentials: result.credentials }) : failFromResult(result);
  },
  {
    schema: z.object({ confirm: z.literal(true, { message: "admin.validation.confirmRequired" }) }),
    auth: "admin",
    permission: "managers.update",
    rateLimit: "admin",
  },
);
