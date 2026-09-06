"use client";

import Link from "next/link";
import { BarChart3, Star } from "lucide-react";
import type { EventDetail } from "@/types";
import { cn } from "@/lib/cn";
import { formatTime, relativeDay } from "@/lib/format";
import { outcomeShortLabel } from "@/lib/selection";
import { useI18n } from "@/i18n/I18nProvider";
import { TeamCrest } from "@/components/brand/TeamCrest";
import { OddsButton } from "@/components/betting/OddsButton";
import { ScoreBoard } from "./ScoreBoard";
import { LiveIndicator } from "./LiveIndicator";

/** Explicit map rather than a concatenated key, so the audit can see them. */
const STATUS_KEY: Record<EventDetail["status"], string> = {
  scheduled: "status.scheduled",
  live: "status.live",
  finished: "status.finished",
  cancelled: "status.cancelled",
  postponed: "status.postponed",
};

export interface MatchCardProps {
  event: EventDetail;
  /** Hide the competition line when the card sits under a competition heading. */
  showCompetition?: boolean;
  className?: string;
}

/**
 * The workhorse row: two sides, a time or a score, and the main market.
 *
 * Laid out as a grid rather than flex so the price block sits on the same
 * column across every card in a list — a ragged odds column is what makes a
 * board feel cheap.
 */
export function MatchCard({ event, showCompetition = true, className }: MatchCardProps) {
  const { t, locale } = useI18n();

  const mainMarket = event.markets.find((market) => market.order === 1);
  const isLive = event.status === "live";
  const day = relativeDay(event.startTime, new Date());

  const timeLabel =
    day === "today"
      ? t("time.today")
      : day === "tomorrow"
        ? t("time.tomorrow")
        : new Intl.DateTimeFormat(locale === "ar" ? "ar-TN" : locale, {
            weekday: "short",
            day: "2-digit",
            month: "short",
          }).format(new Date(event.startTime));

  return (
    <article
      className={cn(
        "group grid grid-cols-1 gap-3 rounded-lg border border-line bg-surface p-3 transition-[border-color,background-color] duration-base hover:border-line-strong hover:bg-surface-2/50 sm:grid-cols-[1fr_auto] sm:items-center sm:gap-4",
        className,
      )}
    >
      <div className="min-w-0">
        <div className="mb-2 flex items-center gap-2">
          {isLive ? (
            <LiveIndicator live={event.live} variant="inline" />
          ) : (
            <span className="numeric text-caption normal-case tracking-normal text-ink-subtle">
              {timeLabel} · {formatTime(event.startTime, locale)}
            </span>
          )}

          {showCompetition ? (
            <span className="truncate text-caption normal-case tracking-normal text-ink-subtle">
              {event.competition.shortName}
            </span>
          ) : null}
        </div>

        <Link
          href={`/event/${event.id}`}
          className="-m-1 block rounded-md p-1 transition-colors duration-fast hover:bg-surface-2"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 space-y-1.5">
              <TeamLine team={event.homeTeam} />
              <TeamLine team={event.awayTeam} />
            </div>

            {event.score ? (
              <div className="flex flex-col items-end gap-1.5">
                <span className="numeric text-small font-bold text-ink">
                  {event.score.home}
                </span>
                <span className="numeric text-small font-bold text-ink">
                  {event.score.away}
                </span>
              </div>
            ) : null}
          </div>
        </Link>
      </div>

      <div className="flex items-center gap-2 sm:w-[290px]">
        {mainMarket ? (
          <div className="grid flex-1 grid-cols-3 gap-1.5">
            {mainMarket.selections.slice(0, 3).map((selection) => (
              <OddsButton
                key={selection.id}
                selection={selection}
                market={mainMarket}
                event={event}
                caption={outcomeShortLabel(selection, event, t)}
              />
            ))}
          </div>
        ) : (
          <p className="flex-1 text-center text-caption normal-case tracking-normal text-ink-subtle">
            {t(STATUS_KEY[event.status])}
          </p>
        )}

        <Link
          href={`/event/${event.id}`}
          aria-label={t("ui.details")}
          className="numeric grid h-12 w-11 shrink-0 place-items-center rounded-md border border-line bg-surface-2 text-caption font-semibold text-ink-muted transition-colors duration-fast hover:border-line-strong hover:text-ink"
        >
          +{event.marketCount}
        </Link>
      </div>
    </article>
  );
}

function TeamLine({ team }: { team: EventDetail["homeTeam"] }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <TeamCrest name={team.name} monogram={team.monogram} hue={team.hue} size="xs" />
      <span className="truncate text-small font-medium text-ink">{team.shortName}</span>
    </div>
  );
}

export interface MatchCardActionsProps {
  eventId: string;
  hasTracker: boolean;
}

/** Statistics / favourite affordances, split out so live cards can reuse them. */
export function MatchCardActions({ eventId, hasTracker }: MatchCardActionsProps) {
  const { t } = useI18n();

  return (
    <div className="flex items-center gap-1">
      {hasTracker ? (
        <Link
          href={`/event/${eventId}?tab=stats`}
          aria-label={t("ui.statistics")}
          className="grid size-7 place-items-center rounded-md text-ink-subtle transition-colors duration-fast hover:bg-surface-3 hover:text-ink"
        >
          <BarChart3 size={14} aria-hidden="true" />
        </Link>
      ) : null}
      <button
        type="button"
        aria-label={t("ui.favorite")}
        className="grid size-7 cursor-pointer place-items-center rounded-md text-ink-subtle transition-colors duration-fast hover:bg-surface-3 hover:text-warning"
      >
        <Star size={14} aria-hidden="true" />
      </button>
    </div>
  );
}
