import { changePasswordSchema } from "@/lib/validation";
import { fail, ok, withRoute } from "@/server/api";
import { changeOwnPassword } from "@/services/authService";

/**
 * POST /api/auth/password/change
 *
 * The one endpoint reachable while a forced password change is pending. Ends
 * every other session and rotates this one.
 */
export const POST = withRoute(
  async ({ input }) => {
    const result = await changeOwnPassword({
      currentPassword: input.currentPassword,
      newPassword: input.newPassword,
    });
    if (!result.ok) {
      return fail("validation_failed", result.errorKey ?? "common.error.unexpected", {
        fields: Object.entries(result.fieldErrors ?? {}).map(([field, messageKey]) => ({
          field,
          messageKey,
        })),
      });
    }
    return ok({ changed: true });
  },
  { schema: changePasswordSchema, auth: "user", allowPasswordChangePending: true, rateLimit: "password" },
);
