import { forgotPasswordSchema } from "@/lib/validation";
import { ok, withRoute } from "@/server/api";
import { requestPasswordReset } from "@/services/authService";

/** POST /api/auth/password/forgot — the same `200` for every address, known or not. */
export const POST = withRoute(
  async ({ input }) => {
    await requestPasswordReset(input.email);
    return ok({ submitted: true });
  },
  { schema: forgotPasswordSchema, rateLimit: "passwordReset" },
);
