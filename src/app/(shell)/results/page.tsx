import type { Metadata } from "next";
import { getCompetitions, getResults, getSports } from "@/services/sportsService";
import { getT } from "@/i18n/server";
import { isSportKey } from "@/lib/sport";
import { ResultsView } from "@/components/matches/ResultsView";

interface PageProps {
  searchParams: Promise<{ sport?: string; date?: string; competition?: string; page?: string }>;
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("sportsbook.results.title") };
}

export default async function ResultsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const sportKey = params.sport && isSportKey(params.sport) ? params.sport : undefined;

  const [t, sports, competitions, results] = await Promise.all([
    getT(),
    getSports(),
    getCompetitions({}),
    getResults({
      sportKey,
      competitionId: params.competition,
      dateIso: params.date,
      page: Number(params.page ?? 1),
      pageSize: 20,
    }),
  ]);

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8">
      <header className="mb-5">
        <h1 className="text-h1 text-ink">{t("sportsbook.results.title")}</h1>
        <p className="mt-1 text-small text-ink-muted">
          {t("sportsbook.results.description")}
        </p>
      </header>

      <ResultsView
        results={results}
        sports={sports}
        competitions={competitions}
        activeSport={sportKey}
        activeCompetition={params.competition}
        activeDate={params.date}
      />
    </div>
  );
}
