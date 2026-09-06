"use client";

import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { useState } from "react";
import type { CompetitionWithEvents } from "@/types";
import { cn } from "@/lib/cn";
import { useT } from "@/i18n/I18nProvider";
import { CompetitionCrest } from "@/components/brand/CompetitionCrest";
import { MatchCard } from "@/components/matches/MatchCard";
import { StatusDot } from "@/components/ui/StatusDot";

export interface CompetitionSectionProps {
  block: CompetitionWithEvents;
  defaultOpen?: boolean;
  className?: string;
}

/**
 * One competition and its fixtures — the repeating unit of every sport page.
 * Collapsible because a football page carries twenty of these and a user
 * following one league should be able to fold the rest away.
 */
export function CompetitionSection({
  block,
  defaultOpen = true,
  className,
}: CompetitionSectionProps) {
  const t = useT();
  const [open, setOpen] = useState(defaultOpen);
  const { competition, country, events } = block;
  const headingId = `competition-${competition.id}`;

  return (
    <section
      aria-labelledby={headingId}
      className={cn("overflow-hidden rounded-xl border border-line bg-surface", className)}
    >
      <div className="flex items-center gap-2 border-b border-line-soft bg-surface-2/40 px-3 py-2.5">
        <button
          type="button"
          id={headingId}
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-controls={`${headingId}-panel`}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 text-start"
        >
          <ChevronDown
            size={15}
            aria-hidden="true"
            className={cn(
              "shrink-0 text-ink-subtle transition-transform duration-base",
              !open && "-rotate-90 rtl:rotate-90",
            )}
          />
          <CompetitionCrest
            name={competition.name}
            monogram={competition.monogram}
            hue={competition.hue}
            size="sm"
          />
          <span className="min-w-0">
            <span className="block truncate text-small font-semibold text-ink">
              {competition.name}
            </span>
            <span className="block truncate text-caption normal-case tracking-normal text-ink-subtle">
              <span aria-hidden="true">{country.flag}</span> {t(country.nameKey)}
            </span>
          </span>
        </button>

        {competition.liveEventCount > 0 ? (
          <span className="flex shrink-0 items-center gap-1">
            <StatusDot tone="live" pulse size="xs" />
            <span className="numeric text-caption font-semibold text-live">
              {competition.liveEventCount}
            </span>
          </span>
        ) : null}

        <Link
          href={`/competition/${competition.id}`}
          className="shrink-0 rounded-md px-2 py-1 text-caption normal-case tracking-normal text-ink-subtle transition-colors duration-fast hover:bg-surface-3 hover:text-ink"
        >
          {t("ui.seeAll")}
        </Link>
      </div>

      <div id={`${headingId}-panel`} hidden={!open} className="divide-y divide-line-soft">
        {events.map((event) => (
          <MatchCard
            key={event.id}
            event={event}
            showCompetition={false}
            className="rounded-none border-0 bg-transparent hover:bg-surface-2/40"
          />
        ))}
      </div>
    </section>
  );
}
