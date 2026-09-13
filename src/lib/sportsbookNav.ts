import type { Competition, Country, Sport, SportKey } from "@/types";
import type { CasinoGame, GameCategory } from "@/types/games";
import { isSportKey } from "./sport";
import { normalise } from "./search";

/**
 * The site navigation model: sport → country → competition, and the games
 * lobby → category → game.
 *
 * Built from whatever the feed returns, never from a hand-written list, so a
 * league that gains fixtures appears in the sidebar and one that runs dry
 * drops out. Pure and framework-free — the sidebar, the mobile drawer, the
 * page headers and the breadcrumbs all read the same tree and the same URLs.
 */

/* ------------------------------------------------------------------- routes */

/**
 * Every navigation target is a URL, so a filtered board is shareable, survives
 * a reload, and renders on the server. The country is a query parameter on the
 * sport page rather than its own route because it narrows that page — it has
 * no content of its own.
 */
export const sportsbookHref = {
  all: () => "/sports",
  sport: (key: SportKey) => `/sports/${key}`,
  country: (key: SportKey, code: string) =>
    `/sports/${key}?country=${encodeURIComponent(code.toLowerCase())}`,
  competition: (id: string) => `/competition/${id}`,
  games: () => "/games",
  game: (slug: string) => `/games/${slug}`,
} as const;

/** Codes arrive lowercased from the URL; the catalogue stores them uppercase. */
export function findCountryByParam(
  countries: readonly Country[],
  value: string | null | undefined,
): Country | undefined {
  if (!value) return undefined;
  const code = value.trim().toUpperCase();
  return countries.find((country) => country.code === code);
}

/* ------------------------------------------------------------------ cookie */

/**
 * Collapsed/expanded rail preference. A cookie rather than localStorage so the
 * server renders the right grid on the first byte — otherwise a user who
 * collapsed the rail watches it spring open and shut on every hard load.
 */
export const SIDEBAR_COOKIE = "sportgo_sidebar";
export const SIDEBAR_COLLAPSED_VALUE = "collapsed";

/* -------------------------------------------------------------------- tree */

/** The catch-all "WW" bucket, pinned above the countries as "International". */
const INTERNATIONAL_CODE = "WW";

export interface NavCountry {
  country: Country;
  competitions: Competition[];
  eventCount: number;
  liveEventCount: number;
}

export interface NavSport {
  sport: Sport;
  /** This sport's flagship competitions, for the per-sport "Popular" group. */
  popular: Competition[];
  countries: NavCountry[];
}

export interface BuildSportsNavInput {
  sports: readonly Sport[];
  competitions: readonly Competition[];
  countries: readonly Country[];
  /** Localised country name — the long tail is sorted alphabetically by it. */
  countryName: (country: Country) => string;
  locale: string;
}

const byOrder = (a: Competition, b: Competition) => a.order - b.order;

/**
 * Only competitions with something to bet on are listed: a league with no open
 * fixtures is a dead end, and a sidebar full of dead ends is worse than a short
 * one.
 */
export function buildSportsNav({
  sports,
  competitions,
  countries,
  countryName,
  locale,
}: BuildSportsNavInput): NavSport[] {
  const countriesById = new Map(countries.map((country) => [country.id, country]));

  return [...sports]
    .sort((a, b) => a.order - b.order)
    .map((sport) => {
      const own = competitions
        .filter((competition) => competition.sportId === sport.id && competition.eventCount > 0)
        .sort(byOrder);

      const groups = new Map<string, NavCountry>();
      for (const competition of own) {
        const country = countriesById.get(competition.countryId);
        if (!country) continue;

        const group = groups.get(country.id) ?? {
          country,
          competitions: [],
          eventCount: 0,
          liveEventCount: 0,
        };
        group.competitions.push(competition);
        group.eventCount += competition.eventCount;
        group.liveEventCount += competition.liveEventCount;
        groups.set(country.id, group);
      }

      return {
        sport,
        popular: own.filter((competition) => competition.popular),
        countries: [...groups.values()].sort(byCountryProminence(countryName, locale)),
      };
    })
    .filter((entry) => entry.countries.length > 0);
}

/**
 * International first. Then the countries that host a flagship competition, in
 * the order those competitions are ranked — which is how the big five end up
 * together at the top. Everything else follows alphabetically in the reader's
 * language, because a long tail with no natural order should at least be
 * predictable to scan.
 */
function byCountryProminence(countryName: (country: Country) => string, locale: string) {
  const flagshipRank = (group: NavCountry) =>
    group.competitions.find((competition) => competition.popular)?.order ?? Infinity;

  return (a: NavCountry, b: NavCountry): number => {
    const aInternational = a.country.code === INTERNATIONAL_CODE;
    const bInternational = b.country.code === INTERNATIONAL_CODE;
    if (aInternational !== bInternational) return aInternational ? -1 : 1;

    const rankA = flagshipRank(a);
    const rankB = flagshipRank(b);
    if (rankA !== rankB) return rankA - rankB;

    return countryName(a.country).localeCompare(countryName(b.country), locale);
  };
}

/** Flagship competitions across every sport, grouped in sport order. */
export function popularCompetitions(
  sports: readonly Sport[],
  competitions: readonly Competition[],
): Competition[] {
  const sportOrder = new Map(sports.map((sport) => [sport.id, sport.order]));

  return competitions
    .filter((competition) => competition.popular && competition.eventCount > 0)
    .sort((a, b) => {
      const bySport = (sportOrder.get(a.sportId) ?? 0) - (sportOrder.get(b.sportId) ?? 0);
      return bySport !== 0 ? bySport : a.order - b.order;
    });
}

/* ------------------------------------------------------------------- games */

export interface NavGameCategory {
  category: GameCategory;
  games: CasinoGame[];
}

/** Lobby order: our own games first, then the provider shelves. */
const GAME_CATEGORY_ORDER: readonly GameCategory[] = [
  "originals",
  "slots",
  "table_games",
  "live_casino",
  "game_shows",
];

/**
 * Only games that open. A title waiting on a provider has no page to go to,
 * so it has no place in navigation either — the lobby is where it is shown.
 */
export function buildGamesNav(games: readonly CasinoGame[]): NavGameCategory[] {
  return GAME_CATEGORY_ORDER.map((category) => ({
    category,
    games: games
      .filter((game) => game.category === category && game.status === "playable")
      .sort((a, b) => b.popularity - a.popularity),
  })).filter((entry) => entry.games.length > 0);
}

/* --------------------------------------------------------------- selection */

export type SportsbookScope =
  | "home"
  | "all"
  | "sport"
  | "country"
  | "competition"
  | "games"
  | "game"
  | "none";

/**
 * What the board is currently showing, resolved to the level of the tree it
 * belongs to. A competition carries its sport and country with it, so the
 * sidebar can open the path to it however the user arrived — from the rail,
 * a "See all" link, search or a shared URL.
 */
export interface SportsbookSelection {
  scope: SportsbookScope;
  sportKey?: SportKey;
  countryId?: string;
  competitionId?: string;
  gameSlug?: string;
  gameCategory?: GameCategory;
}

export function resolveSelection(
  pathname: string,
  countryParam: string | null,
  sports: readonly Sport[],
  competitions: readonly Competition[],
  countries: readonly Country[],
  games: readonly CasinoGame[],
): SportsbookSelection {
  const [first, second] = pathname.split("/").filter(Boolean);

  if (!first) return { scope: "home" };

  if (first === "games") {
    if (!second) return { scope: "games" };
    const game = games.find((entry) => entry.slug === second);
    return game
      ? { scope: "game", gameSlug: game.slug, gameCategory: game.category }
      : { scope: "none" };
  }

  if (first === "sports" && !second) return { scope: "all" };

  if (first === "sports" && second && isSportKey(second)) {
    const country = findCountryByParam(countries, countryParam);
    return country
      ? { scope: "country", sportKey: second, countryId: country.id }
      : { scope: "sport", sportKey: second };
  }

  if (first === "competition" && second) {
    const competition = competitions.find((entry) => entry.id === second);
    const sport = sports.find((entry) => entry.id === competition?.sportId);
    if (competition && sport) {
      return {
        scope: "competition",
        sportKey: sport.key,
        countryId: competition.countryId,
        competitionId: competition.id,
      };
    }
  }

  return { scope: "none" };
}

/* ------------------------------------------------------------------ search */

export interface LeagueMatch {
  competition: Competition;
  sport: Sport;
  country: Country;
}

/**
 * Matches a competition by its own names, its country or its sport — typing
 * "england" or "basket" is as natural as typing "premier". Name hits rank
 * above context hits, prefix hits above substring hits, then tree order.
 */
export function searchLeagues(
  nav: readonly NavSport[],
  query: string,
  labels: { sport: (sport: Sport) => string; country: (country: Country) => string },
): LeagueMatch[] {
  const needle = normalise(query);
  if (needle.length === 0) return [];

  const scored: Array<LeagueMatch & { score: number; rank: number }> = [];
  let rank = 0;

  for (const { sport, countries } of nav) {
    const sportLabel = normalise(labels.sport(sport));
    for (const { country, competitions } of countries) {
      const countryLabel = normalise(labels.country(country));
      for (const competition of competitions) {
        rank += 1;
        const names = [competition.name, competition.shortName].map(normalise);

        let score = 0;
        if (names.some((name) => name.startsWith(needle))) score = 4;
        else if (names.some((name) => name.split(/\s+/).some((word) => word.startsWith(needle)))) score = 3;
        else if (names.some((name) => name.includes(needle))) score = 2;
        else if (countryLabel.includes(needle) || sportLabel.includes(needle)) score = 1;

        if (score > 0) scored.push({ competition, sport, country, score, rank });
      }
    }
  }

  return scored
    .sort((a, b) => b.score - a.score || a.rank - b.rank)
    .map(({ competition, sport, country }) => ({ competition, sport, country }));
}
