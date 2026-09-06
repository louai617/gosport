"use client";

import { useMemo, useState } from "react";
import { Radio } from "lucide-react";
import type { EventDetail, Sport } from "@/types";
import { useT } from "@/i18n/I18nProvider";
import { Chip } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/EmptyState";
import { ScrollFade } from "@/components/ui/ScrollFade";
import { SportIcon } from "@/components/sports/SportIcon";
import { LiveMatchCard } from "./LiveMatchCard";

export interface LiveBoardProps {
  events: EventDetail[];
  sports: Sport[];
}

/**
 * Live board with a sport filter.
 *
 * The filter is client state rather than a URL param on purpose: this is a
 * transient view of a moving board, and putting it in the URL would make the
 * back button undo a filter change instead of leaving the page.
 */
export function LiveBoard({ events, sports }: LiveBoardProps) {
  const t = useT();
  const [sportId, setSportId] = useState<string | null>(null);

  const sportsWithLive = useMemo(
    () =>
      sports.filter((sport) => events.some((event) => event.sportId === sport.id)),
    [sports, events],
  );

  const visible = sportId
    ? events.filter((event) => event.sportId === sportId)
    : events;

  if (events.length === 0) {
    return (
      <div className="rounded-xl border border-line bg-surface">
        <EmptyState
          icon={<Radio size={20} aria-hidden="true" />}
          title={t("empty.noLiveMatches")}
          description={t("home.live.emptyDescription")}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ScrollFade showControls={false}>
        <div
          role="group"
          aria-label={t("sportsbook.filterBySport")}
          className="flex gap-1.5 pb-1"
        >
          <Chip active={sportId === null} onClick={() => setSportId(null)} count={events.length}>
            {t("sports.all")}
          </Chip>

          {sportsWithLive.map((sport) => (
            <Chip
              key={sport.id}
              active={sportId === sport.id}
              onClick={() => setSportId(sport.id)}
              icon={<SportIcon name={sport.icon} size={14} />}
              count={events.filter((event) => event.sportId === sport.id).length}
            >
              {t(sport.nameKey)}
            </Chip>
          ))}
        </div>
      </ScrollFade>

      {visible.length === 0 ? (
        <div className="rounded-xl border border-line bg-surface">
          <EmptyState
            size="sm"
            icon={<Radio size={18} aria-hidden="true" />}
            title={t("empty.noLiveMatches")}
            description={t("empty.tryDifferentFilter")}
          />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
          {visible.map((event) => (
            <LiveMatchCard key={event.id} event={event} />
          ))}
        </div>
      )}
    </div>
  );
}
