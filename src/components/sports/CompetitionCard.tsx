"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { Competition, Country } from "@/types";
import { cn } from "@/lib/cn";
import { useT } from "@/i18n/I18nProvider";
import { CompetitionCrest } from "@/components/brand/CompetitionCrest";
import { StatusDot } from "@/components/ui/StatusDot";

export interface CompetitionCardProps {
  competition: Competition;
  country?: Country;
  className?: string;
}

export function CompetitionCard({ competition, country, className }: CompetitionCardProps) {
  const t = useT();

  return (
    <Link
      href={`/competition/${competition.id}`}
      className={cn(
        "group flex items-center gap-3 rounded-lg border border-line bg-surface p-3 transition-[border-color,transform] duration-base hover:-translate-y-px hover:border-line-strong hover:bg-surface-2",
        className,
      )}
    >
      <CompetitionCrest
        name={competition.name}
        monogram={competition.monogram}
        hue={competition.hue}
        countryFlag={country?.flag}
        size="lg"
      />

      <div className="min-w-0 flex-1">
        <p className="truncate text-small font-semibold text-ink">{competition.name}</p>
        <p className="mt-0.5 flex items-center gap-2 text-caption normal-case tracking-normal text-ink-subtle">
          {country ? <span className="truncate">{t(country.nameKey)}</span> : null}
          {competition.liveEventCount > 0 ? (
            <span className="flex items-center gap-1 text-live">
              <StatusDot tone="live" pulse size="xs" />
              <span className="numeric font-semibold">{competition.liveEventCount}</span>
            </span>
          ) : (
            <span className="numeric">
              {t("sportsbook.eventCount", { count: competition.eventCount })}
            </span>
          )}
        </p>
      </div>

      <ChevronRight
        size={16}
        aria-hidden="true"
        className="flip-rtl shrink-0 text-ink-subtle transition-transform duration-base group-hover:translate-x-0.5"
      />
    </Link>
  );
}
