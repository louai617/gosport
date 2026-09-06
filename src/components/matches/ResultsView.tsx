"use client";

import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { CalendarX } from "lucide-react";
import type { Competition, EventResult, Paginated, Sport } from "@/types";
import { formatDate, formatTime } from "@/lib/format";
import { useI18n } from "@/i18n/I18nProvider";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pagination } from "@/components/ui/Pagination";
import { Select } from "@/components/ui/Select";
import { TeamCrest } from "@/components/brand/TeamCrest";
import { ScoreBoard } from "./ScoreBoard";

export interface ResultsViewProps {
  results: Paginated<EventResult>;
  sports: Sport[];
  competitions: Competition[];
  activeSport?: string;
  activeCompetition?: string;
  activeDate?: string;
}

/**
 * Filters live in the URL, not in component state: a filtered results view is
 * something a user shares, bookmarks and reaches with the back button.
 */
export function ResultsView({
  results,
  sports,
  competitions,
  activeSport,
  activeCompetition,
  activeDate,
}: ResultsViewProps) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    // Any filter change invalidates the current page.
    if (key !== "page") next.delete("page");
    router.push(`/results?${next.toString()}`);
  };

  const relevantCompetitions = activeSport
    ? competitions.filter(
        (competition) =>
          competition.sportId === sports.find((sport) => sport.key === activeSport)?.id,
      )
    : competitions;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Select
          label={t("sportsbook.results.filterSport")}
          value={activeSport ?? ""}
          onChange={(event) => setParam("sport", event.target.value)}
          placeholder={t("sports.all")}
          options={sports.map((sport) => ({ value: sport.key, label: t(sport.nameKey) }))}
        />

        <Select
          label={t("sportsbook.competitions")}
          value={activeCompetition ?? ""}
          onChange={(event) => setParam("competition", event.target.value)}
          placeholder={t("sports.all")}
          options={relevantCompetitions.map((competition) => ({
            value: competition.id,
            label: competition.name,
          }))}
        />

        <div>
          <label
            htmlFor="results-date"
            className="mb-1.5 block text-small text-ink-muted"
          >
            {t("sportsbook.results.filterDate")}
          </label>
          <input
            id="results-date"
            type="date"
            value={activeDate ?? ""}
            onChange={(event) => setParam("date", event.target.value)}
            className="numeric h-[38px] w-full rounded-md border border-line bg-surface-2 px-3 text-small text-ink transition-colors duration-fast hover:border-line-strong focus:border-primary"
          />
        </div>
      </div>

      {results.items.length === 0 ? (
        <div className="rounded-xl border border-line bg-surface">
          <EmptyState
            icon={<CalendarX size={20} aria-hidden="true" />}
            title={t("empty.noResults")}
            description={t("empty.tryDifferentFilter")}
          />
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <ul className="divide-y divide-line-soft">
            {results.items.map(({ event, outcomeKey }) => (
              <li key={event.id}>
                <Link
                  href={`/event/${event.id}`}
                  className="flex items-center gap-3 px-3 py-3 transition-colors duration-fast hover:bg-surface-2/60"
                >
                  <div className="w-28 shrink-0 sm:w-36">
                    <p className="numeric truncate text-caption normal-case tracking-normal text-ink-subtle">
                      {formatDate(event.startTime, locale)}
                    </p>
                    <p className="numeric truncate text-caption normal-case tracking-normal text-ink-subtle">
                      {formatTime(event.startTime, locale)} · {event.competition.shortName}
                    </p>
                  </div>

                  <div className="min-w-0 flex-1 space-y-1.5">
                    <TeamLine team={event.homeTeam} />
                    <TeamLine team={event.awayTeam} />
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <ScoreBoard score={event.score} size="sm" tone="final" />
                    <span className="text-caption normal-case tracking-normal text-ink-subtle">
                      {t(outcomeKey)}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>

          <Pagination
            page={results.page}
            pageSize={results.pageSize}
            total={results.total}
            onPageChange={(page) => setParam("page", String(page))}
          />
        </div>
      )}
    </div>
  );
}

function TeamLine({ team }: { team: EventResult["event"]["homeTeam"] }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <TeamCrest name={team.name} monogram={team.monogram} hue={team.hue} size="xs" />
      <span className="truncate text-small text-ink">{team.shortName}</span>
    </div>
  );
}
