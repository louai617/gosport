import type { Competition, Sport } from "@/types";
import type { MockDataset } from "./types";
import { COMPETITIONS, COUNTRIES, SPORTS, TEAMS } from "./catalog";
import { buildFixtures } from "./fixtures";
import { buildPromotions } from "./promotions";
import { PAYMENT_METHODS } from "./payments";
/**
 * Assembles the full demo dataset for a reference instant.
 *
 * Event and live counts on sports and competitions are computed here rather
 * than hard-coded, so the number on a navigation chip always matches what the
 * user finds when they click it.
 */
export function buildDataset(nowMs: number): MockDataset {
  const { events, markets, selections } = buildFixtures(nowMs);

  const countBySport = new Map<string, { total: number; live: number }>();
  const countByCompetition = new Map<string, { total: number; live: number }>();

  for (const event of events) {
    // A finished or cancelled fixture is not something to bet on, so it does
    // not contribute to the counts shown in navigation.
    if (event.status !== "scheduled" && event.status !== "live") continue;

    for (const [map, key] of [
      [countBySport, event.sportId],
      [countByCompetition, event.competitionId],
    ] as const) {
      const entry = map.get(key) ?? { total: 0, live: 0 };
      entry.total += 1;
      if (event.status === "live") entry.live += 1;
      map.set(key, entry);
    }
  }

  const sports: Sport[] = SPORTS.map((sport) => ({
    ...sport,
    eventCount: countBySport.get(sport.id)?.total ?? 0,
    liveEventCount: countBySport.get(sport.id)?.live ?? 0,
  }));

  const competitions: Competition[] = COMPETITIONS.map((competition) => ({
    ...competition,
    eventCount: countByCompetition.get(competition.id)?.total ?? 0,
    liveEventCount: countByCompetition.get(competition.id)?.live ?? 0,
  }));

  return {
    nowMs,
    sports,
    countries: COUNTRIES,
    competitions,
    teams: TEAMS,
    events,
    markets,
    selections,
    promotions: buildPromotions(nowMs),
    paymentMethods: PAYMENT_METHODS,
  };
}
