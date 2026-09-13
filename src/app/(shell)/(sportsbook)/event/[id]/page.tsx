import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getEventById } from "@/services/sportsService";
import { getMarketsForEvent } from "@/services/oddsService";
import { getT } from "@/i18n/server";
import { EventDetailView } from "@/components/matches/EventDetailView";

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

  return <EventDetailView event={event} markets={markets} />;
}
