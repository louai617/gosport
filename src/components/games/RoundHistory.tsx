"use client";

import { History } from "lucide-react";
import type { GameKey } from "@/types/games";
import { cn } from "@/lib/cn";
import { formatAmount } from "@/lib/format";
import { useHydrated } from "@/lib/useHydrated";
import { useI18n } from "@/i18n/I18nProvider";
import { useGameStore } from "@/store/gameStore";
import { EmptyState } from "@/components/ui/EmptyState";
import { ScrollFade } from "@/components/ui/ScrollFade";

export interface RoundHistoryProps {
  /** Limits to one game; omit to show the whole session. */
  gameKey?: GameKey;
}

/**
 * The session's recent results.
 *
 * A strip of multipliers rather than a table: on a fast game the only thing
 * worth reading at a glance is the shape of the last twenty rounds, and a
 * seven-column table of them is unreadable while a round is running.
 */
export function RoundHistory({ gameKey }: RoundHistoryProps) {
  const { t, locale } = useI18n();
  const hydrated = useHydrated();
  const history = useGameStore((state) => state.history);

  if (!hydrated) return null;

  const rounds = gameKey
    ? history.filter((round) => round.gameKey === gameKey)
    : history;

  if (rounds.length === 0) {
    return (
      <section className="rounded-xl border border-line bg-surface">
        <EmptyState
          size="sm"
          icon={<History size={18} aria-hidden="true" />}
          title={t("games.history.empty")}
        />
      </section>
    );
  }

  return (
    <section
      aria-label={t("games.history.title")}
      className="rounded-xl border border-line bg-surface p-3"
    >
      <h2 className="mb-2 text-caption uppercase text-ink-subtle">
        {t("games.history.title")}
      </h2>

      <ScrollFade showControls={false}>
        <ul className="flex gap-1.5 pb-1">
          {rounds.slice(0, 24).map((round) => {
            const won = round.multiplier > 0;
            return (
              <li key={round.id}>
                <span
                  title={`${round.gameKey} · ${formatAmount(round.profit, locale)}`}
                  className={cn(
                    "numeric flex h-8 min-w-14 items-center justify-center rounded-md border px-2 text-caption font-semibold",
                    won
                      ? "border-success/30 bg-success-soft text-success"
                      : "border-line bg-surface-2 text-ink-subtle",
                  )}
                >
                  {won ? `${round.multiplier.toFixed(2)}×` : "—"}
                </span>
              </li>
            );
          })}
        </ul>
      </ScrollFade>
    </section>
  );
}
