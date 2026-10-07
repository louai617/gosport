import { registerSchema } from "@/lib/validation";
import { fail, ok, withRoute } from "@/server/api";
import { issueSession } from "@/server/auth/session";
import { getRequestMeta } from "@/server/security/requestMeta";
import { registerPlayer } from "@/services/authService";

/**
 * POST /api/auth/register
 *
 * Creates the account and signs it in. Registration is a **self-declaration**:
 * `ageConfirmed` is a box an anonymous visitor ticked and nothing here verifies
 * identity or age — see docs/COMPLIANCE.md. Refused outright when an
 * administrator has switched registration off.
 */
export const POST = withRoute(
  async ({ input }) => {
    const result = await registerPlayer(input);
    if (!result.ok) {
      return fail("validation_failed", result.errorKey, {
        fields: Object.entries(result.fieldErrors ?? {}).map(([field, messageKey]) => ({
          field,
          messageKey,
        })),
      });
    }

    const meta = await getRequestMeta();
    await issueSession(result.user, { ipHash: meta.ipHash, userAgent: meta.userAgent });
    return ok({ user: { id: result.user.id, username: result.user.username } }, { status: 201 });
  },
  { schema: registerSchema, rateLimit: "register" },
);
