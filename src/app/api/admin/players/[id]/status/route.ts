import { z } from "zod";
import { reasonSchema } from "@/lib/adminValidation";
import { fail, ok, withRoute } from "@/server/api";
import {
  lockPlayer,
  reactivatePlayer,
  suspendPlayer,
} from "@/services/playerAdminService";

const body = z.object({
  action: z.enum(["suspend", "lock", "reactivate"]),
  reason: reasonSchema,
  confirm: z.literal(true, { message: "admin.validation.confirmRequired" }),
});

/** POST /api/admin/players/:id/status — suspend, lock or reactivate (reason required). */
export const POST = withRoute(
  async ({ input, params }) => {
    const id = params.id!;
    const result =
      input.action === "suspend"
        ? await suspendPlayer(id, input.reason)
        : input.action === "lock"
          ? await lockPlayer(id, input.reason)
          : await reactivatePlayer(id, input.reason);
    return result.ok ? ok({ status: input.action }) : fail("conflict", result.errorKey ?? "common.error.unexpected");
  },
  // `players.suspend` / `players.lock` are re-checked inside the service per action.
  { schema: body, auth: "admin", permission: "players.suspend", rateLimit: "admin" },
);
