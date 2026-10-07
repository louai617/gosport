import { resetPasswordSchema } from "@/lib/validation";
import { fail, ok, withRoute } from "@/server/api";
import { completePasswordReset } from "@/services/authService";

/** POST /api/auth/password/reset — consumes a one-time token and sets a new password. */
export const POST = withRoute(
  async ({ input }) => {
    const result = await completePasswordReset(input.token, input.password);
    if (!result.ok) return fail("validation_failed", result.errorKey ?? "auth.error.tokenInvalid");
    return ok({ reset: true });
  },
  { schema: resetPasswordSchema, rateLimit: "passwordReset" },
);
