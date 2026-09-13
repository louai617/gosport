"use client";

import { useCallback, useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import type { Competition, Country, Favorite, Sport, SportKey } from "@/types";
import type { CasinoGame, GameCategory } from "@/types/games";
import { useI18n } from "@/i18n/I18nProvider";
import {
  buildGamesNav,
  buildSportsNav,
  popularCompetitions,
  resolveSelection,
  type NavGameCategory,
  type NavSport,
  type SportsbookSelection,
} from "@/lib/sportsbookNav";

export interface SportsbookNavData {
  sports: Sport[];
  competitions: Competition[];
  countries: Country[];
  favorites: Favorite[];
  games: CasinoGame[];
}

export interface SportsbookNav {
  nav: NavSport[];
  gamesNav: NavGameCategory[];
  popular: Competition[];
  favorites: Competition[];
  selection: SportsbookSelection;
  sportsById: ReadonlyMap<string, Sport>;
  countriesById: ReadonlyMap<string, Country>;
  /** Every competition, including ones with no open fixtures and so no tree node. */
  competitionsById: ReadonlyMap<string, Competition>;
  gamesBySlug: ReadonlyMap<string, CasinoGame>;
  totals: { events: number; live: number };
  isOpen: (id: string) => boolean;
  toggle: (id: string) => void;
  open: (id: string) => void;
}

/** Stable ids for every expandable node, shared by the rows and their panels. */
export const navNodeId = {
  popular: "popular",
  favorites: "favorites",
  sport: (key: SportKey) => `sport:${key}`,
  sportPopular: (key: SportKey) => `sport:${key}:popular`,
  country: (key: SportKey, countryId: string) => `sport:${key}:${countryId}`,
  gameCategory: (category: GameCategory) => `games:${category}`,
} as const;

/** The nodes that must be open for the current selection to be visible. */
function pathTo(selection: SportsbookSelection): string[] {
  if (selection.gameCategory) return [navNodeId.gameCategory(selection.gameCategory)];
  if (!selection.sportKey) return [];
  const ids = [navNodeId.sport(selection.sportKey)];
  if (selection.countryId) ids.push(navNodeId.country(selection.sportKey, selection.countryId));
  return ids;
}

interface TreeState {
  expanded: ReadonlySet<string>;
  /** Opened on the user's behalf to reveal the selection, rather than by hand. */
  auto: ReadonlySet<string>;
}

function followSelection(previous: TreeState, path: string[]): TreeState {
  const expanded = new Set(previous.expanded);
  for (const id of previous.auto) {
    if (!path.includes(id)) expanded.delete(id);
  }

  // A node already opened by hand stays the user's even when it joins the path.
  const auto = new Set(
    path.filter((id) => previous.auto.has(id) || !previous.expanded.has(id)),
  );
  for (const id of path) expanded.add(id);

  return { expanded, auto };
}

function selectionKey(selection: SportsbookSelection): string {
  return [
    selection.scope,
    selection.sportKey,
    selection.countryId,
    selection.competitionId,
    selection.gameSlug,
  ].join("|");
}

/**
 * Everything the rail, the collapsed rail and the mobile drawer render from.
 *
 * Lives in the shell — which sits in a layout and so survives navigation —
 * rather than in the sidebar itself, so which groups are open outlives
 * collapsing the rail, closing the drawer and moving between pages.
 */
export function useSportsbookNav({
  sports,
  competitions,
  countries,
  favorites,
  games,
}: SportsbookNavData): SportsbookNav {
  const { t, locale } = useI18n();
  const pathname = usePathname();
  const countryParam = useSearchParams().get("country");

  const nav = useMemo(
    () =>
      buildSportsNav({
        sports,
        competitions,
        countries,
        countryName: (country) => t(country.nameKey),
        locale,
      }),
    [sports, competitions, countries, t, locale],
  );

  const gamesNav = useMemo(() => buildGamesNav(games), [games]);

  const popular = useMemo(
    () => popularCompetitions(sports, competitions),
    [sports, competitions],
  );

  const favoriteCompetitions = useMemo(() => {
    const ids = new Set(
      favorites.filter((item) => item.kind === "competition").map((item) => item.targetId),
    );
    return competitions
      .filter((competition) => ids.has(competition.id) && competition.eventCount > 0)
      .sort((a, b) => a.order - b.order);
  }, [favorites, competitions]);

  const selection = useMemo(
    () => resolveSelection(pathname, countryParam, sports, competitions, countries, games),
    [pathname, countryParam, sports, competitions, countries, games],
  );

  const sportsById = useMemo(() => new Map(sports.map((sport) => [sport.id, sport])), [sports]);
  const countriesById = useMemo(
    () => new Map(countries.map((country) => [country.id, country])),
    [countries],
  );
  const competitionsById = useMemo(
    () => new Map(competitions.map((competition) => [competition.id, competition])),
    [competitions],
  );
  const gamesBySlug = useMemo(() => new Map(games.map((game) => [game.slug, game])), [games]);

  const totals = useMemo(
    () =>
      sports.reduce(
        (sum, sport) => ({
          events: sum.events + sport.eventCount,
          live: sum.live + sport.liveEventCount,
        }),
        { events: 0, live: 0 },
      ),
    [sports],
  );

  const [tree, setTree] = useState<TreeState>(() => {
    const path = pathTo(selection);
    return {
      expanded: new Set([navNodeId.popular, navNodeId.favorites, ...path]),
      auto: new Set(path),
    };
  });

  // Arriving at a league or a game — from the rail, a "See all" link, a shared
  // URL, the back button — opens the path to it and folds away the path it
  // replaced, so the new selection is not buried under the last one. A page
  // with no place in the tree (home, a match, the lobby) leaves it as it was:
  // opening a fixture from Premier League should not shut Premier League.
  // Groups the user opened by hand are theirs and are never folded. Adjusted
  // during render, not in an effect, so no frame paints with the path shut.
  const currentKey = selectionKey(selection);
  const [seenKey, setSeenKey] = useState(currentKey);
  if (seenKey !== currentKey) {
    setSeenKey(currentKey);
    const path = pathTo(selection);
    if (path.length > 0) setTree((previous) => followSelection(previous, path));
  }

  const toggle = useCallback((id: string) => {
    setTree((previous) => {
      const expanded = new Set(previous.expanded);
      if (expanded.has(id)) expanded.delete(id);
      else expanded.add(id);
      const auto = new Set(previous.auto);
      auto.delete(id);
      return { expanded, auto };
    });
  }, []);

  /** Opens a row the user is navigating into — part of the path, so it may fold away later. */
  const open = useCallback((id: string) => {
    setTree((previous) =>
      previous.expanded.has(id)
        ? previous
        : { expanded: new Set([...previous.expanded, id]), auto: new Set([...previous.auto, id]) },
    );
  }, []);

  const isOpen = useCallback((id: string) => tree.expanded.has(id), [tree.expanded]);

  return {
    nav,
    gamesNav,
    popular,
    favorites: favoriteCompetitions,
    selection,
    sportsById,
    countriesById,
    competitionsById,
    gamesBySlug,
    totals,
    isOpen,
    toggle,
    open,
  };
}
