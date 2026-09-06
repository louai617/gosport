import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getEventById } from "@/services/sportsService";
import { getMarketsForEvent } from "@/services/oddsService";
import { getT } from "@/i18n/server";
import { EventDetailView } from "@/components/matches/EventDetailView";
import { BetSlipPanel } from "@/components/betting/BetSlipPanel";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const event = await getEventById(id);
  if (!event) return {};

  return {
    title: `${event.homeTeam.shortName} — ${event.awayTeam.shortName}`,
    description: event.competition.name,
  };
}

export default async function EventPage({ params }: PageProps) {
  const { id } = await params;
  const [event, markets] = await Promise.all([
    getEventById(id),
    getMarketsForEvent(id),
  ]);

  if (!event) notFound();
  await getT();

  return (
    <div className="mx-auto grid max-w-[1440px] gap-6 px-4 py-6 sm:px-6 lg:px-8 xl:grid-cols-[minmax(0,1fr)_340px] xl:gap-7">
      <EventDetailView event={event} markets={markets} />
      <div className="hidden xl:block">
        <BetSlipPanel />
      </div>
    </div>
  );
}
