import type { CasinoGame, GameCategory, GameProvider } from "@/types/games";
import { GAMES, GAME_BY_SLUG } from "@/data/games";
import { PROVIDERS, getGameProvider } from "./gameProvider";

/**
 * Casino catalogue reads.
 *
 * ── WHERE ROUNDS ARE SETTLED ──────────────────────────────────────────────
 * In this build an original's round is computed in the browser against a
 * simulated session balance, because there is no server to hold a seed or a
 * ledger. That is a demo affordance, not an architecture:
 *
 *   A licensed operator MUST generate the server seed, compute the outcome and
 *   settle the wallet server-side, inside one transaction. A client that can
 *   see the server seed can predict every result, and a client that can credit
 *   its own balance is not a casino — it is a spreadsheet the player owns.
 *
 * `placeRound` below marks that boundary explicitly so the eventual server
 * implementation has a signature to take over.
 * ──────────────────────────────────────────────────────────────────────────
 */

export interface GameQuery {
  category?: GameCategory;
  providerId?: string;
  status?: CasinoGame["status"];
  search?: string;
  limit?: number;
}

function matches(game: CasinoGame, query: GameQuery, title: string): boolean {
  if (query.category && game.category !== query.category) return false;
  if (query.providerId && game.providerId !== query.providerId) return false;
  if (query.status && game.status !== query.status) return false;
  if (query.search && !title.toLowerCase().includes(query.search.toLowerCase())) {
    return false;
  }
  return true;
}

export async function getGames(query: GameQuery = {}): Promise<CasinoGame[]> {
  // Originals carry an i18n key rather than a name, so a search over the
  // catalogue matches the slug — the one stable, language-independent handle.
  const found = GAMES.filter((game) => matches(game, query, game.name ?? game.slug));
  const sorted = [...found].sort((a, b) => b.popularity - a.popularity);
  return query.limit ? sorted.slice(0, query.limit) : sorted;
}

export async function getGameBySlug(slug: string): Promise<CasinoGame | null> {
  return GAME_BY_SLUG.get(slug) ?? null;
}

export async function getPlayableGames(): Promise<CasinoGame[]> {
  return getGames({ status: "playable" });
}

export async function getFeaturedGames(limit = 4): Promise<CasinoGame[]> {
  return GAMES.filter((game) => game.featured).slice(0, limit);
}

export async function getProviders(): Promise<GameProvider[]> {
  return PROVIDERS;
}

export async function getProviderById(id: string): Promise<GameProvider | null> {
  return PROVIDERS.find((provider) => provider.id === id) ?? null;
}

export interface CategorySummary {
  category: GameCategory;
  total: number;
  playable: number;
}

export async function getCategorySummaries(): Promise<CategorySummary[]> {
  const categories: GameCategory[] = [
    "originals",
    "slots",
    "live_casino",
    "table_games",
    "game_shows",
  ];

  return categories.map((category) => {
    const inCategory = GAMES.filter((game) => game.category === category);
    return {
      category,
      total: inCategory.length,
      playable: inCategory.filter((game) => game.status === "playable").length,
    };
  });
}

/* ------------------------------------------------------------- launching */

export interface LaunchOutcome {
  ok: boolean;
  /** Set only for in-house originals, which render in-app. */
  nativeRoute?: string;
  launchUrl?: string;
  errorKey?: string;
}

/**
 * Resolves how a game opens.
 *
 * Originals render as a route in this app. Everything else has to come from
 * the provider adapter, which refuses — so the lobby can show the title and
 * still be truthful that it cannot be opened.
 */
export async function launchGame(slug: string): Promise<LaunchOutcome> {
  const game = await getGameBySlug(slug);
  if (!game) return { ok: false, errorKey: "games.error.notFound" };

  if (game.status === "playable" && game.key) {
    return { ok: true, nativeRoute: `/games/${game.slug}` };
  }

  if (game.status === "coming_soon") {
    return { ok: false, errorKey: "games.error.comingSoon" };
  }

  const provider = getGameProvider();
  const result = await provider.launch({
    gameId: game.id,
    sessionToken: "",
    currency: "TND",
    locale: "fr",
    demo: true,
    returnUrl: "/games",
  });

  return {
    ok: result.ok,
    launchUrl: result.launchUrl,
    errorKey: result.errorKey ?? "games.error.providerNotConnected",
  };
}

/**
 * The server-side settlement seam.
 *
 * Deliberately refuses rather than accepting a round the client computed.
 * Trusting a browser-reported outcome is the single most exploitable thing a
 * casino backend can do, and a stub that "just records it for now" is how that
 * ends up in production.
 */
export async function placeRound(): Promise<{ ok: false; errorKey: string }> {
  return { ok: false, errorKey: "games.error.serverSettlementRequired" };
}
