"use client";

import Link from "next/link";
import { ArrowRight, CalendarClock } from "lucide-react";
import type { EventDetail } from "@/types";
import { cn } from "@/lib/cn";
import { formatTime, relativeDay } from "@/lib/format";
import { marketLabel, outcomeShortLabel } from "@/lib/selection";
import { useI18n } from "@/i18n/I18nProvider";
import { CompetitionCrest } from "@/components/brand/CompetitionCrest";
import { TeamCrest } from "@/components/brand/TeamCrest";
import { OddsButton } from "@/components/betting/OddsButton";
import { Badge } from "@/components/ui/Badge";
import { SimulatedBadge } from "@/components/ui/SimulatedBadge";
import { Countdown } from "./Countdown";
import { LiveIndicator } from "./LiveIndicator";
import { ScoreBoard } from "./ScoreBoard";

export interface FeaturedEventCardProps {
  event: EventDetail;
  className?: string;
}

/** Markets promoted onto the hero beneath the main three-way. */
const SECONDARY_KEYS = ["over_under", "btts", "double_chance"] as const;

/**
 * The homepage hero.
 *
 * One fixture, given room: the competition it belongs to, both sides at a
 * size where the crest reads, a countdown, and enough of the book to bet from
 * without a second click. Everything else on the page is denser than this by
 * design — the hero is the only place the product raises its voice.
 */
export function FeaturedEventCard({ event, className }: FeaturedEventCardProps) {
  const { t, locale } = useI18n();

  const isLive = event.status === "live";
  const mainMarket = event.markets.find((market) => market.order === 1);

  const secondary = SECONDARY_KEYS.map((key) =>
    event.markets.find((market) => market.key === key),
  ).filter((market): market is NonNullable<typeof market> => Boolean(market));

  const day = relativeDay(event.startTime, new Date());
  const dayLabel =
    day === "today"
      ? t("time.today")
      : day === "tomorrow"
        ? t("time.tomorrow")
        : new Intl.DateTimeFormat(locale === "ar" ? "ar-TN" : locale, {
            weekday: "long",
            day: "2-digit",
            month: "long",
          }).format(new Date(event.startTime));

  return (
    <article
      className={cn(
        "gradient-hero relative overflow-hidden rounded-2xl border border-line shadow-e3 edge-light",
        className,
      )}
    >
      <div className="relative p-5 sm:p-6 lg:p-7">
        {/* -------- competition + status -------- */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <CompetitionCrest
              name={event.competition.name}
              monogram={event.competition.monogram}
              hue={event.competition.hue}
              countryFlag={event.country.flag}
              size="md"
            />
            <div className="min-w-0">
              <p className="truncate text-small font-semibold text-ink">
                {event.competition.name}
              </p>
              <p className="truncate text-caption normal-case tracking-normal text-ink-subtle">
                {t(event.country.nameKey)}
              </p>
            </div>
          </div>

          {isLive ? (
            <LiveIndicator live={event.live} />
          ) : (
            <Badge tone="primary" size="md">
              {t("home.hero.featured")}
            </Badge>
          )}
        </div>

        {/* -------- the fixture -------- */}
        <div className="mt-6 grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-6">
          <TeamBlock team={event.homeTeam} align="start" />

          <div className="flex flex-col items-center gap-2">
            {isLive ? (
              <ScoreBoard score={event.score} size="lg" />
            ) : (
              <span
                aria-hidden="true"
                className="text-caption uppercase text-ink-subtle"
              >
                {t("home.hero.versus")}
              </span>
            )}
          </div>

          <TeamBlock team={event.awayTeam} align="end" />
        </div>

        {/* -------- when -------- */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-3">
          <p className="flex items-center gap-2 text-small text-ink-muted">
            <CalendarClock size={15} aria-hidden="true" className="text-ink-subtle" />
            <span>
              {dayLabel} · <span className="numeric">{formatTime(event.startTime, locale)}</span>
            </span>
          </p>

          {!isLive ? <Countdown targetIso={event.startTime} size="sm" /> : null}
        </div>

        {/* -------- main market -------- */}
        {mainMarket ? (
          <div className="mt-6">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-caption uppercase text-ink-subtle">
                {marketLabel(mainMarket, t)}
              </h3>
              <SimulatedBadge />
            </div>

            <div className="grid grid-cols-3 gap-2">
              {mainMarket.selections.map((selection) => (
                <OddsButton
                  key={selection.id}
                  selection={selection}
                  market={mainMarket}
                  event={event}
                  variant="hero"
                  caption={outcomeShortLabel(selection, event, t)}
                />
              ))}
            </div>
          </div>
        ) : null}

        {/* -------- promoted secondary markets -------- */}
        {secondary.length > 0 ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {secondary.map((market) => (
              <div key={market.id} className="min-w-0">
                <h4 className="mb-1.5 truncate text-caption uppercase text-ink-subtle">
                  {marketLabel(market, t)}
                </h4>
                <div
                  className={cn(
                    "grid gap-1.5",
                    market.selections.length === 3 ? "grid-cols-3" : "grid-cols-2",
                  )}
                >
                  {market.selections.map((selection) => (
                    <OddsButton
                      key={selection.id}
                      selection={selection}
                      market={market}
                      event={event}
                      variant="compact"
                      caption={outcomeShortLabel(selection, event, t)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : null}

        <div className="mt-5 flex justify-center">
          <Link
            href={`/event/${event.id}`}
            className="group inline-flex items-center gap-1.5 text-small font-semibold text-primary transition-colors duration-fast hover:text-primary-hover"
          >
            {t("home.hero.allMarkets", { count: event.marketCount })}
            <ArrowRight
              size={14}
              aria-hidden="true"
              className="flip-rtl transition-transform duration-base group-hover:translate-x-0.5"
            />
          </Link>
        </div>
      </div>
    </article>
  );
}

function TeamBlock({
  team,
  align,
}: {
  team: EventDetail["homeTeam"];
  align: "start" | "end";
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col items-center gap-2.5 sm:flex-row sm:gap-3",
        align === "end" && "sm:flex-row-reverse",
      )}
    >
      <TeamCrest name={team.name} monogram={team.monogram} hue={team.hue} size="xl" />
      <div className={cn("min-w-0 text-center", align === "end" ? "sm:text-end" : "sm:text-start")}>
        <p className="truncate text-h3 text-ink">{team.shortName}</p>
        <p className="truncate text-caption normal-case tracking-normal text-ink-subtle">
          {team.code}
        </p>
      </div>
    </div>
  );
}
