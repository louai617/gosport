import { ensureCsrfToken } from "@/server/security/csrf";
import { ok, withRoute } from "@/server/api";
import { readBalance } from "@/server/casino/service";
import { resolveCasinoSession, sessionCookie } from "@/server/casino/session";

/**
 * GET /api/casino/session
 *
 * Opens (or resumes) the casino session and hands back the authoritative
 * balance plus a CSRF token for the write endpoints. The client calls this
 * before it can bet — it is the only place the ledger key is minted.
 */
export const GET = withRoute(
  async () => {
    const session = await resolveCasinoSession();
    const csrfToken = await ensureCsrfToken();

    const response = ok({
      balance: readBalance(session.sessionId, session.openingBalance),
      csrfToken,
      simulated: true,
    });

    if (session.issued) {
      response.headers.append("set-cookie", sessionCookie(session.sessionId));
    }
    return response;
  },
  { rateLimit: "api" },
);
