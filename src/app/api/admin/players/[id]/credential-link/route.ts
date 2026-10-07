import { fail, ok, withRoute } from "@/server/api";
import { createCredentialLink } from "@/services/playerAdminService";

/**
 * POST /api/admin/players/:id/credential-link
 *
 * Issues a one-time invitation / password-reset link. The response is the only
 * time the link exists in the clear; it is stored hashed and expires. The
 * operator never sees — and the system never stores — a password.
 */
export const POST = withRoute(
  async ({ params }) => {
    const result = await createCredentialLink(params.id!);
    return result.ok ? ok({ link: result.link }) : fail("conflict", result.errorKey ?? "common.error.unexpected");
  },
  { auth: "admin", permission: "players.credentials", rateLimit: "admin" },
);
