"use client";

import { useEffect, useState } from "react";
import { History } from "lucide-react";
import type { GameKey } from "@/types/games";
import { cn } from "@/lib/cn";
import { formatAmount } from "@/lib/format";
import { useHydrated } from "@/lib/useHydrated";
import { useI18n } from "@/i18n/I18nProvider";
import { EmptyState } from "@/components/ui/EmptyState";
import { ScrollFade } from "@/components/ui/ScrollFade";
import { useWallet } from "@/components/wallet/WalletProvider";

export interface RoundHistoryProps {
  /** Limits to one game; omit to show every game. */
  gameKey?: GameKey;
}

interface Row {
  id: string;
  gameKey: string;
  multiplier: number;
  profit: number;
}

/**
 * The player's recent results, read from the server's record of settled rounds.
 *
 * A strip of multipliers rather than a table: on a fast game the only thing
 * worth reading at a glance is the shape of the last twenty rounds. It reloads
 * when the balance changes, which is exactly when a round has just settled.
 */
export function RoundHistory({ gameKey }: RoundHistoryProps) {
  const { t, locale } = useI18n();
  const hydrated = useHydrated();
  const { balance, signedIn, ready } = useWallet();
  const [rounds, setRounds] = useState<Row[]>([]);

  useEffect(() => {
    if (!ready || !signedIn) return;
    let cancelled = false;
    const query = gameKey ? `?game=${gameKey}&limit=24` : "?limit=24";
    void fetch(`/api/casino/history${query}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((body: { ok: boolean; data?: Row[] }) => {
        if (!cancelled && body.ok && body.data) setRounds(body.data);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [ready, signedIn, gameKey, balance]);

  if (!hydrated) return null;

  if (rounds.length === 0) {
    return (
      <section className="rounded-xl border border-line bg-surface">
        <EmptyState size="sm" icon={<History size={18} aria-hidden="true" />} title={t("games.history.empty")} />
      </section>
    );
  }

  return (
    <section aria-label={t("games.history.title")} className="rounded-xl border border-line bg-surface p-3">
      <h2 className="mb-2 text-caption uppercase text-ink-subtle">{t("games.history.title")}</h2>

      <ScrollFade showControls={false}>
        <ul className="flex gap-1.5 pb-1">
          {rounds.map((round) => {
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
