import { getGameBySlug, launchGame } from "@/services/gamesService";
import { fail, ok, withRoute } from "@/server/api";

/**
 * GET /api/games/:slug
 *
 * Returns the catalogue entry together with how it would open. Provider titles
 * resolve to a refusal rather than a URL, because no adapter is connected.
 */
export const GET = withRoute(
  async ({ params }) => {
    const slug = params.slug ?? "";
    const game = await getGameBySlug(slug);
    if (!game) return fail("not_found", "games.error.notFound", { status: 404 });

    const launch = await launchGame(slug);
    return ok({ game, launch });
  },
  { rateLimit: "api" },
);
