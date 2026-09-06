import { getProviders } from "@/services/gamesService";
import { ok, withRoute } from "@/server/api";

/**
 * GET /api/games/providers
 *
 * Every provider and its connection state. Useful precisely because the
 * answer is "not connected" — an integration status endpoint that can only
 * ever say "fine" is not an integration status endpoint.
 */
export const GET = withRoute(async () => ok(await getProviders()), {
  rateLimit: "api",
});
