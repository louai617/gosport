import type { Metadata } from "next";
import {
  getCompetitions,
  getCompetitionsWithEvents,
  getCountries,
  getSports,
} from "@/services/sportsService";
import { getFavorites } from "@/services/userService";
import { getT } from "@/i18n/server";
import { SportsbookShell } from "@/components/layout/SportsbookShell";
import { SportsSidebar } from "@/components/sports/SportsSidebar";
import { SportBoard } from "@/components/sports/SportBoard";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("nav.sports") };
}

export default async function SportsPage() {
  const [t, sports, competitions, countries, favorites, blocks] = await Promise.all([
    getT(),
    getSports(),
    getCompetitions({}),
    getCountries(),
    getFavorites(),
    getCompetitionsWithEvents({ status: ["scheduled", "live"] }),
  ]);

  return (
    <SportsbookShell
      sidebar={
        <SportsSidebar
          sports={sports}
          competitions={competitions}
          countries={countries}
          favorites={favorites}
        />
      }
    >
      <div className="space-y-6">
        <header>
          <h1 className="text-h1 text-ink">{t("sportsbook.allSports")}</h1>
          <p className="mt-1 text-small text-ink-muted">
            {t("sportsbook.allSportsDescription")}
          </p>
        </header>

        <SportBoard blocks={blocks.slice(0, 25)} />
      </div>
    </SportsbookShell>
  );
}
