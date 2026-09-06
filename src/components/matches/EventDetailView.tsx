"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BarChart3, ChevronLeft } from "lucide-react";
import type { EventDetail, MarketWithSelections } from "@/types";
import { formatDateTime } from "@/lib/format";
import { useI18n } from "@/i18n/I18nProvider";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { SimulatedBadge } from "@/components/ui/SimulatedBadge";
import { Tab, TabList, TabPanel, Tabs } from "@/components/ui/Tabs";
import { CompetitionCrest } from "@/components/brand/CompetitionCrest";
import { TeamCrest } from "@/components/brand/TeamCrest";
import { MarketGroup } from "@/components/betting/MarketGroup";
import { Countdown } from "./Countdown";
import { LiveIndicator } from "./LiveIndicator";
import { ScoreBoard } from "./ScoreBoard";

export interface EventDetailViewProps {
  event: EventDetail;
  markets: MarketWithSelections[];
}

export function EventDetailView({ event, markets }: EventDetailViewProps) {
  const { t, locale } = useI18n();
  const [tab, setTab] = useState("markets");

  const isLive = event.status === "live";

  // Group by the market's own group key so the tabs mirror how a trader would
  // organise the book, not the arbitrary order the feed returned.
  const groups = useMemo(() => {
    const map = new Map<string, MarketWithSelections[]>();
    for (const market of markets) {
      const list = map.get(market.groupKey) ?? [];
      list.push(market);
      map.set(market.groupKey, list);
    }
    return [...map.entries()];
  }, [markets]);

  return (
    <div className="min-w-0 space-y-5">
      <Link
        href={`/sports/${event.sport.key}`}
        className="inline-flex items-center gap-1.5 text-small text-ink-muted transition-colors duration-fast hover:text-ink"
      >
        <ChevronLeft size={15} aria-hidden="true" className="flip-rtl" />
        {t(event.sport.nameKey)}
      </Link>

      <header className="gradient-hero overflow-hidden rounded-xl border border-line p-5 shadow-e2 edge-light">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href={`/competition/${event.competition.id}`}
            className="flex min-w-0 items-center gap-2.5 transition-opacity duration-fast hover:opacity-80"
          >
            <CompetitionCrest
              name={event.competition.name}
              monogram={event.competition.monogram}
              hue={event.competition.hue}
              countryFlag={event.country.flag}
              size="md"
            />
            <span className="min-w-0">
              <span className="block truncate text-small font-semibold text-ink">
                {event.competition.name}
              </span>
              <span className="block truncate text-caption normal-case tracking-normal text-ink-subtle">
                {t(event.country.nameKey)}
              </span>
            </span>
          </Link>

          {isLive ? (
            <LiveIndicator live={event.live} />
          ) : (
            <Badge tone={event.status === "scheduled" ? "neutral" : "warning"} size="md">
              {t(`status.${event.status}`)}
            </Badge>
          )}
        </div>

        <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <div className="flex min-w-0 flex-col items-center gap-2 sm:flex-row sm:gap-3">
            <TeamCrest
              name={event.homeTeam.name}
              monogram={event.homeTeam.monogram}
              hue={event.homeTeam.hue}
              size="lg"
            />
            <span className="min-w-0 truncate text-h3 text-ink">
              {event.homeTeam.shortName}
            </span>
          </div>

          <div className="flex flex-col items-center gap-1">
            {event.score ? (
              <ScoreBoard score={event.score} size="lg" tone={isLive ? "live" : "final"} />
            ) : (
              <span aria-hidden="true" className="text-caption uppercase text-ink-subtle">
                {t("home.hero.versus")}
              </span>
            )}
          </div>

          <div className="flex min-w-0 flex-col items-center gap-2 sm:flex-row-reverse sm:gap-3">
            <TeamCrest
              name={event.awayTeam.name}
              monogram={event.awayTeam.monogram}
              hue={event.awayTeam.hue}
              size="lg"
            />
            <span className="min-w-0 truncate text-h3 text-ink">
              {event.awayTeam.shortName}
            </span>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-3">
          <p className="numeric text-small text-ink-muted">
            {t("sportsbook.event.kickoff")} · {formatDateTime(event.startTime, locale)}
          </p>
          {event.status === "scheduled" ? (
            <Countdown targetIso={event.startTime} size="sm" />
          ) : null}
        </div>
      </header>

      <Tabs value={tab} onValueChange={setTab}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabList aria-label={t("sportsbook.matchDetails")}>
            <Tab value="markets">
              {t("sportsbook.event.markets")} ({markets.length})
            </Tab>
            <Tab value="stats">{t("sportsbook.event.statistics")}</Tab>
          </TabList>
          <SimulatedBadge variant="block" />
        </div>

        <TabPanel value="markets" className="mt-4">
          {markets.length === 0 ? (
            <div className="rounded-xl border border-line bg-surface">
              <EmptyState
                icon={<BarChart3 size={20} aria-hidden="true" />}
                title={t("sportsbook.event.noMarkets")}
              />
            </div>
          ) : (
            <div className="space-y-5">
              {groups.map(([groupKey, groupMarkets]) => (
                <section key={groupKey} aria-label={t(groupKey)}>
                  <h2 className="mb-2 text-caption uppercase text-ink-subtle">
                    {t(groupKey)}
                  </h2>
                  <div className="space-y-2">
                    {groupMarkets.map((market) => (
                      <MarketGroup key={market.id} market={market} event={event} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </TabPanel>

        <TabPanel value="stats" className="mt-4">
          <Alert tone="info" title={t("sportsbook.event.statistics")}>
            {t("sportsbook.event.statsUnavailable")}
          </Alert>
        </TabPanel>
      </Tabs>
    </div>
  );
}
