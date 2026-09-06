import { registerSchema } from "@/lib/validation";
import { register } from "@/services/userService";
import { fail, ok, withRoute } from "@/server/api";

/**
 * POST /api/auth/register
 *
 * DEMO: creates no account, stores no password and performs **no age or
 * identity verification**. `ageConfirmed` is a self-declaration; a licensed
 * provider must confirm the date of birth before the account could stake or
 * deposit. See docs/COMPLIANCE.md.
 */
export const POST = withRoute(
  async ({ input }) => {
    const result = await register(input);
    if (!result.ok) {
      return fail("validation_failed", result.errorKey ?? "error.generic", {
        status: 422,
      });
    }
    return ok({ created: false, verificationRequired: true, simulated: true });
  },
  { schema: registerSchema, rateLimit: "register", audit: "auth.register" },
);
