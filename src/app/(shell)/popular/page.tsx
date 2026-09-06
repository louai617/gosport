import type { Metadata } from "next";
import {
  getCountries,
  getPopularCompetitions,
  getUpcomingEvents,
} from "@/services/sportsService";
import { getT } from "@/i18n/server";
import { Section } from "@/components/layout/Section";
import { CompetitionCard } from "@/components/sports/CompetitionCard";
import { MatchList } from "@/components/matches/MatchList";
import { BetSlipPanel } from "@/components/betting/BetSlipPanel";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("nav.popular") };
}

export default async function PopularPage() {
  const [t, competitions, countries, events] = await Promise.all([
    getT(),
    getPopularCompetitions(12),
    getCountries(),
    getUpcomingEvents({ limit: 20 }),
  ]);

  return (
    <div className="mx-auto grid max-w-[1440px] gap-6 px-4 py-6 sm:px-6 lg:px-8 xl:grid-cols-[minmax(0,1fr)_340px] xl:gap-7">
      <div className="min-w-0 space-y-8">
        <header>
          <h1 className="text-h1 text-ink">{t("sportsbook.popular.title")}</h1>
          <p className="mt-1 text-small text-ink-muted">
            {t("sportsbook.popular.description")}
          </p>
        </header>

        <Section title={t("sportsbook.competitions")}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {competitions.map((competition) => (
              <CompetitionCard
                key={competition.id}
                competition={competition}
                country={countries.find((entry) => entry.id === competition.countryId)}
              />
            ))}
          </div>
        </Section>

        <Section title={t("home.upcoming.title")}>
          <MatchList events={events} groupByDay />
        </Section>
      </div>

      <div className="hidden xl:block">
        <BetSlipPanel />
      </div>
    </div>
  );
}
