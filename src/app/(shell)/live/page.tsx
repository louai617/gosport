import type { Metadata } from "next";
import { Radio } from "lucide-react";
import {
  getCompetitions,
  getCountries,
  getLiveEvents,
  getSports,
} from "@/services/sportsService";
import { getFavorites } from "@/services/userService";
import { getT } from "@/i18n/server";
import { SportsbookShell } from "@/components/layout/SportsbookShell";
import { SportsSidebar } from "@/components/sports/SportsSidebar";
import { LiveBoard } from "@/components/matches/LiveBoard";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("sportsbook.live.title") };
}

export default async function LivePage() {
  const [t, sports, competitions, countries, favorites, events] = await Promise.all([
    getT(),
    getSports(),
    getCompetitions({}),
    getCountries(),
    getFavorites(),
    getLiveEvents({}),
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
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2.5 text-h1 text-ink">
              <Radio size={22} aria-hidden="true" className="text-live" />
              {t("sportsbook.live.title")}
            </h1>
            <p className="mt-1 text-small text-ink-muted">
              {t("sportsbook.live.description")}
            </p>
          </div>
        </header>

        <LiveBoard events={events} sports={sports} />
      </div>
    </SportsbookShell>
  );
}
