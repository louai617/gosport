import { cookies } from "next/headers";
import { getCompetitions, getCountries, getSports } from "@/services/sportsService";
import { getFavorites } from "@/services/userService";
import { getPlayableGames } from "@/services/gamesService";
import { SIDEBAR_COLLAPSED_VALUE, SIDEBAR_COOKIE } from "@/lib/sportsbookNav";
import { SportsbookShell } from "@/components/layout/SportsbookShell";

/**
 * Shared frame for every page the rail navigates between: the homepage, the
 * sportsbook, match pages and the games.
 *
 * A layout rather than a wrapper each page renders: layouts are preserved
 * across navigation, so moving from Football to England to Premier League, or
 * on to a game, swaps only the centre — the rail keeps its scroll position and
 * open groups, and the bet slip beside it never remounts.
 */
export default async function SportsbookLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const [sports, competitions, countries, favorites, games, cookieStore] = await Promise.all([
    getSports(),
    getCompetitions({}),
    getCountries(),
    getFavorites(),
    getPlayableGames(),
    cookies(),
  ]);

  return (
    <SportsbookShell
      sports={sports}
      competitions={competitions}
      countries={countries}
      favorites={favorites}
      games={games}
      defaultCollapsed={cookieStore.get(SIDEBAR_COOKIE)?.value === SIDEBAR_COLLAPSED_VALUE}
    >
      {children}
    </SportsbookShell>
  );
}
