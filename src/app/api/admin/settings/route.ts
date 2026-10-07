import { z } from "zod";
import { fail, ok, withRoute } from "@/server/api";
import { getAllSettings, updateSettings } from "@/server/settings/settingsService";

/** GET /api/admin/settings — effective values of every supported setting. */
export const GET = withRoute(async () => ok(await getAllSettings()), {
  auth: "admin",
  permission: "settings.read",
  rateLimit: "admin",
});

/** PATCH /api/admin/settings — partial update; unknown keys are rejected. */
export const PATCH = withRoute(
  async ({ input }) => {
    const result = await updateSettings(input);
    if (!result.ok) {
      return fail("validation_failed", result.errorKey ?? "common.error.checkFields", {
        fields: (result.invalid ?? []).map((field) => ({ field, messageKey: "common.validation.invalid" })),
      });
    }
    return ok(await getAllSettings());
  },
  { schema: z.record(z.string().max(80), z.unknown()), auth: "admin", permission: "settings.update", rateLimit: "admin" },
);
