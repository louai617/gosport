"use client";

import Link from "next/link";
import type { EventDetail } from "@/types";
import { cn } from "@/lib/cn";
import { outcomeShortLabel } from "@/lib/selection";
import { useI18n } from "@/i18n/I18nProvider";
import { TeamCrest } from "@/components/brand/TeamCrest";
import { OddsButton } from "@/components/betting/OddsButton";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { LiveIndicator } from "./LiveIndicator";
import { MatchCardActions } from "./MatchCard";

export interface LiveMatchCardProps {
  event: EventDetail;
  className?: string;
}

/**
 * The in-play card. Carries more than a scheduled fixture — score, clock and
 * match progress — because that context is what a live price means.
 */
export function LiveMatchCard({ event, className }: LiveMatchCardProps) {
  const { t } = useI18n();
  const mainMarket = event.markets.find((market) => market.order === 1);

  return (
    <article
      className={cn(
        "flex flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-e2 transition-[border-color,transform] duration-base hover:-translate-y-px hover:border-line-strong edge-light",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-line-soft px-3.5 py-2.5">
        <LiveIndicator live={event.live} variant="inline" />
        <span className="truncate text-caption normal-case tracking-normal text-ink-subtle">
          {event.competition.shortName}
        </span>
      </div>

      <Link
        href={`/event/${event.id}`}
        className="block px-3.5 py-3 transition-colors duration-fast hover:bg-surface-2/50"
      >
        <div className="space-y-2">
          <TeamScoreLine
            name={event.homeTeam.shortName}
            crestName={event.homeTeam.name}
            monogram={event.homeTeam.monogram}
            hue={event.homeTeam.hue}
            score={event.score?.home}
            leading={(event.score?.home ?? 0) > (event.score?.away ?? 0)}
          />
          <TeamScoreLine
            name={event.awayTeam.shortName}
            crestName={event.awayTeam.name}
            monogram={event.awayTeam.monogram}
            hue={event.awayTeam.hue}
            score={event.score?.away}
            leading={(event.score?.away ?? 0) > (event.score?.home ?? 0)}
          />
        </div>

        {event.live ? (
          <ProgressBar
            value={event.live.progress}
            tone="live"
            size="xs"
            className="mt-3"
            label={t(event.live.periodKey)}
          />
        ) : null}
      </Link>

      <div className="mt-auto flex items-center gap-2 border-t border-line-soft px-3.5 py-3">
        {mainMarket ? (
          <div className="grid flex-1 grid-cols-3 gap-1.5">
            {mainMarket.selections.slice(0, 3).map((selection) => (
              <OddsButton
                key={selection.id}
                selection={selection}
                market={mainMarket}
                event={event}
                caption={outcomeShortLabel(selection, event, t)}
                variant="compact"
              />
            ))}
          </div>
        ) : (
          <p className="flex-1 text-caption normal-case tracking-normal text-ink-subtle">
            {t("live.suspended")}
          </p>
        )}

        <MatchCardActions eventId={event.id} hasTracker={event.hasTracker} />
      </div>
    </article>
  );
}

function TeamScoreLine({
  name,
  crestName,
  monogram,
  hue,
  score,
  leading,
}: {
  name: string;
  crestName: string;
  monogram: string;
  hue: number;
  score?: number;
  leading: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <TeamCrest name={crestName} monogram={monogram} hue={hue} size="sm" />
        <span
          className={cn(
            "truncate text-small",
            leading ? "font-semibold text-ink" : "font-medium text-ink-muted",
          )}
        >
          {name}
        </span>
      </div>
      <span
        dir="ltr"
        className={cn(
          "numeric shrink-0 text-h3 font-bold tabular-nums",
          leading ? "text-ink" : "text-ink-muted",
        )}
      >
        {score ?? 0}
      </span>
    </div>
  );
}
