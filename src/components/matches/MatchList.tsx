"use client";

import { CalendarX } from "lucide-react";
import type { EventDetail } from "@/types";
import { cn } from "@/lib/cn";
import { relativeDay } from "@/lib/format";
import { useI18n } from "@/i18n/I18nProvider";
import { EmptyState } from "@/components/ui/EmptyState";
import { MatchCard } from "./MatchCard";

export interface MatchListProps {
  events: EventDetail[];
  /** Insert a day heading whenever the calendar day changes. */
  groupByDay?: boolean;
  showCompetition?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  className?: string;
}

export function MatchList({
  events,
  groupByDay = false,
  showCompetition = true,
  emptyTitle,
  emptyDescription,
  className,
}: MatchListProps) {
  const { t, locale } = useI18n();

  if (events.length === 0) {
    return (
      <EmptyState
        icon={<CalendarX size={20} aria-hidden="true" />}
        title={emptyTitle ?? t("empty.noMatches")}
        description={emptyDescription ?? t("empty.tryDifferentFilter")}
      />
    );
  }

  if (!groupByDay) {
    return (
      <div className={cn("space-y-2", className)}>
        {events.map((event) => (
          <MatchCard key={event.id} event={event} showCompetition={showCompetition} />
        ))}
      </div>
    );
  }

  const now = new Date();
  const groups: Array<{ key: string; label: string; events: EventDetail[] }> = [];

  for (const event of events) {
    const day = relativeDay(event.startTime, now);
    const key =
      day === "other" ? event.startTime.slice(0, 10) : day;

    const label =
      day === "today"
        ? t("time.today")
        : day === "tomorrow"
          ? t("time.tomorrow")
          : new Intl.DateTimeFormat(locale === "ar" ? "ar-TN" : locale, {
              weekday: "long",
              day: "2-digit",
              month: "long",
            }).format(new Date(event.startTime));

    const existing = groups.find((group) => group.key === key);
    if (existing) existing.events.push(event);
    else groups.push({ key, label, events: [event] });
  }

  return (
    <div className={cn("space-y-6", className)}>
      {groups.map((group) => (
        <section key={group.key} aria-label={group.label}>
          <h3 className="mb-2 text-caption uppercase text-ink-subtle">{group.label}</h3>
          <div className="space-y-2">
            {group.events.map((event) => (
              <MatchCard key={event.id} event={event} showCompetition={showCompetition} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
