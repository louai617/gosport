import type { CasinoGame } from "@/types/games";
import { GAME_STAKE, MAX_MULTIPLIER } from "@/lib/games/constants";
import { buildPlinkoTable } from "@/lib/games/plinko";

/**
 * Game catalogue.
 *
 * Originals are playable and carry a real, computed RTP. Everything else is a
 * provider title and is `unavailable`, because no provider is connected —
 * see `src/services/gameProvider.ts` for why that cannot be changed by code.
 *
 * Provider entries are named by game *type* ("Roulette", "Live blackjack")
 * rather than by a studio's product name. Inventing branded titles for games
 * nobody has licensed would put third-party trademarks on a page that also
 * says "play now", which is the wrong side of a line worth staying on.
 */

const IN_HOUSE = "provider-sportgo";

/** Originals are priced at a 1% edge; the exact figure per game is computed. */
const ORIGINAL_RTP = 0.99;

/** Plinko's real return depends on the rounded table, so it is measured. */
const PLINKO_RTP = buildPlinkoTable(16, "medium").actualRtp;

function original(
  slug: string,
  key: CasinoGame["key"],
  hue: number,
  popularity: number,
  overrides: Partial<CasinoGame> = {},
): CasinoGame {
  return {
    id: `game-${slug}`,
    slug,
    key,
    providerId: IN_HOUSE,
    nameKey: `games.title.${key}`,
    taglineKey: `games.tagline.${key}`,
    category: "originals",
    status: "playable",
    houseEdge: 0.01,
    rtp: ORIGINAL_RTP,
    minStake: GAME_STAKE.min,
    maxStake: GAME_STAKE.max,
    maxMultiplier: MAX_MULTIPLIER,
    provablyFair: true,
    hue,
    featured: false,
    popularity,
    simulated: true,
    ...overrides,
  };
}

/**
 * A title that would come from a studio. Every field a provider would own is
 * `null`: the operator does not set another company's RTP or limits, and
 * guessing them on a page a player reads would be inventing figures.
 */
function providerGame(
  slug: string,
  name: string,
  providerId: string,
  category: CasinoGame["category"],
  hue: number,
  popularity: number,
): CasinoGame {
  return {
    id: `game-${slug}`,
    slug,
    providerId,
    name,
    category,
    status: "unavailable",
    houseEdge: null,
    rtp: null,
    minStake: 0,
    maxStake: 0,
    maxMultiplier: null,
    provablyFair: false,
    hue,
    featured: false,
    popularity,
    simulated: true,
  };
}

export const GAMES: CasinoGame[] = [
  /* ------------------------------------------------------- playable now -- */
  original("crash", "crash", 8, 980, { featured: true }),
  original("dice", "dice", 224, 940, { featured: true }),
  original("mines", "mines", 152, 910, { featured: true }),
  original("plinko", "plinko", 44, 870, { rtp: PLINKO_RTP, rtpVariesByConfig: true }),
  original("limbo", "limbo", 268, 820),

  /* ------------------------------------------------- originals in progress */
  original("wheel", "wheel", 190, 610, { status: "coming_soon" }),
  original("keno", "keno", 96, 540, { status: "coming_soon" }),
  original("hilo", "hilo", 320, 500, { status: "coming_soon" }),

  /* ----------------------------------------------------- provider content -- */
  providerGame("roulette", "Roulette", "provider-table", "table_games", 2, 760),
  providerGame("blackjack", "Blackjack", "provider-table", "table_games", 140, 720),
  providerGame("baccarat", "Baccarat", "provider-table", "table_games", 30, 640),
  providerGame("video-poker", "Video poker", "provider-table", "table_games", 258, 480),

  providerGame("live-roulette", "Live roulette", "provider-live", "live_casino", 12, 800),
  providerGame("live-blackjack", "Live blackjack", "provider-live", "live_casino", 148, 780),
  providerGame("live-baccarat", "Live baccarat", "provider-live", "live_casino", 36, 700),
  providerGame("game-shows", "Game shows", "provider-live", "game_shows", 300, 690),

  providerGame("slots-classic", "Classic slots", "provider-slots", "slots", 48, 830),
  providerGame("slots-video", "Video slots", "provider-slots", "slots", 286, 900),
  providerGame("slots-jackpot", "Jackpot slots", "provider-slots", "slots", 340, 860),
  providerGame("slots-megaways", "Cascading slots", "provider-slots", "slots", 172, 750),
];

export const GAME_BY_SLUG: ReadonlyMap<string, CasinoGame> = new Map(
  GAMES.map((game) => [game.slug, game]),
);
