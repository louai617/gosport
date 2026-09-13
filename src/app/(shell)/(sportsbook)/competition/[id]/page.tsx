import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  getCompetitionById,
  getCountries,
  getEvents,
  getSportById,
} from "@/services/sportsService";
import { getT } from "@/i18n/server";
import { sportsbookHref } from "@/lib/sportsbookNav";
import { MatchList } from "@/components/matches/MatchList";
import { CompetitionCrest } from "@/components/brand/CompetitionCrest";
import { Breadcrumbs, type BreadcrumbItem } from "@/components/navigation/Breadcrumbs";
import { SportIcon } from "@/components/sports/SportIcon";

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

  const [t, sport, countries, events] = await Promise.all([
    getT(),
    getSportById(competition.sportId),
    getCountries(),
    getEvents({ competitionId: id, status: ["scheduled", "live"] }),
  ]);

  const country = countries.find((entry) => entry.id === competition.countryId);

  const trail: BreadcrumbItem[] = [];
  if (sport) {
    trail.push({
      label: t(sport.nameKey),
      href: sportsbookHref.sport(sport.key),
      icon: <SportIcon name={sport.icon} size={14} />,
    });
    if (country) {
      trail.push({
        label: t(country.nameKey),
        href: sportsbookHref.country(sport.key, country.code),
        icon: (
          <span aria-hidden="true" className="text-[13px] leading-none">
            {country.flag}
          </span>
        ),
      });
    }
  }
  trail.push({ label: competition.name });

  return (
    <div className="space-y-6">
      <header className="space-y-4">
        <Breadcrumbs label={t("sportsbook.nav.breadcrumb")} items={trail} />

        <div className="flex items-center gap-4">
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
              {competition.liveEventCount > 0
                ? ` · ${t("sportsbook.liveCount", { count: competition.liveEventCount })}`
                : ""}
            </p>
          </div>
        </div>
      </header>

      <MatchList events={events} groupByDay showCompetition={false} />
    </div>
  );
}
