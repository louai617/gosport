import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  getCompetitionById,
  getCompetitions,
  getCountries,
  getEvents,
  getSports,
} from "@/services/sportsService";
import { getFavorites } from "@/services/userService";
import { getT } from "@/i18n/server";
import { SportsbookShell } from "@/components/layout/SportsbookShell";
import { SportsSidebar } from "@/components/sports/SportsSidebar";
import { MatchList } from "@/components/matches/MatchList";
import { CompetitionCrest } from "@/components/brand/CompetitionCrest";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const competition = await getCompetitionById(id);
  return competition ? { title: competition.name } : {};
}

export default async function CompetitionPage({ params }: PageProps) {
  const { id } = await params;
  const competition = await getCompetitionById(id);
  if (!competition) notFound();

  const [t, sports, competitions, countries, favorites, events] = await Promise.all([
    getT(),
    getSports(),
    getCompetitions({ sportId: competition.sportId }),
    getCountries(),
    getFavorites(),
    getEvents({ competitionId: id, status: ["scheduled", "live"] }),
  ]);

  const country = countries.find((entry) => entry.id === competition.countryId);
  const sport = sports.find((entry) => entry.id === competition.sportId);

  return (
    <SportsbookShell
      sidebar={
        <SportsSidebar
          sports={sports}
          competitions={competitions}
          countries={countries}
          favorites={favorites}
          activeSportKey={sport?.key}
        />
      }
    >
      <div className="space-y-6">
        <header className="flex items-center gap-4">
          <CompetitionCrest
            name={competition.name}
            monogram={competition.monogram}
            hue={competition.hue}
            countryFlag={country?.flag}
            size="xl"
          />
          <div className="min-w-0">
            <h1 className="truncate text-h1 text-ink">{competition.name}</h1>
            <p className="mt-1 text-small text-ink-muted">
              {country ? `${t(country.nameKey)} · ` : ""}
              {t("sportsbook.eventCount", { count: competition.eventCount })}
            </p>
          </div>
        </header>

        <MatchList events={events} groupByDay showCompetition={false} />
      </div>
    </SportsbookShell>
  );
}
