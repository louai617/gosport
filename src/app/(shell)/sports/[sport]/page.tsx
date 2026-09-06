import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  getCompetitions,
  getCompetitionsWithEvents,
  getCountries,
  getFeaturedEvent,
  getSportByKey,
  getSports,
} from "@/services/sportsService";
import { getFavorites } from "@/services/userService";
import { getT } from "@/i18n/server";
import { isSportKey } from "@/lib/sport";
import { SportsbookShell } from "@/components/layout/SportsbookShell";
import { SportsSidebar } from "@/components/sports/SportsSidebar";
import { SportBoard } from "@/components/sports/SportBoard";
import { FeaturedEventCard } from "@/components/matches/FeaturedEventCard";

interface PageProps {
  params: Promise<{ sport: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { sport } = await params;
  if (!isSportKey(sport)) return {};

  const t = await getT();
  return { title: t(`sports.${sport}`) };
}

export default async function SportPage({ params }: PageProps) {
  const { sport: sportKey } = await params;
  if (!isSportKey(sportKey)) notFound();

  const sport = await getSportByKey(sportKey);
  if (!sport) notFound();

  const [t, sports, competitions, countries, favorites, blocks, featured] =
    await Promise.all([
      getT(),
      getSports(),
      getCompetitions({ sportId: sport.id }),
      getCountries(),
      getFavorites(),
      getCompetitionsWithEvents({ sportId: sport.id, status: ["scheduled", "live"] }),
      getFeaturedEvent(sportKey),
    ]);

  return (
    <SportsbookShell
      sidebar={
        <SportsSidebar
          sports={sports}
          competitions={competitions}
          countries={countries}
          favorites={favorites}
          activeSportKey={sportKey}
        />
      }
    >
      <div className="space-y-6">
        <header>
          <h1 className="text-h1 text-ink">{t(sport.nameKey)}</h1>
          <p className="mt-1 text-small text-ink-muted">
            {t("sportsbook.eventCount", { count: sport.eventCount })}
            {sport.liveEventCount > 0
              ? ` · ${t("sportsbook.liveCount", { count: sport.liveEventCount })}`
              : ""}
          </p>
        </header>

        {featured ? <FeaturedEventCard event={featured} /> : null}

        <SportBoard blocks={blocks} />
      </div>
    </SportsbookShell>
  );
}
