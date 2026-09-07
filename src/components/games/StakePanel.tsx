"use client";

import { JURISDICTION } from "@/config/app.config";
import { GAME_STAKE, round2 } from "@/lib/games/constants";
import { cn } from "@/lib/cn";
import { formatAmount } from "@/lib/format";
import { useHydrated } from "@/lib/useHydrated";
import { useCasinoReady } from "./useCasinoReady";
import { useI18n } from "@/i18n/I18nProvider";
import { useGameStore } from "@/store/gameStore";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";

export interface StakePanelProps {
  stake: number;
  onStakeChange: (stake: number) => void;
  onBet: () => void;
  betLabel: string;
  /** Game-specific inputs sit above the stake field. */
  children?: React.ReactNode;
  /** Shown beneath the stake — usually the payout on a win. */
  summary?: Array<{ label: string; value: string; emphasis?: boolean }>;
  disabled?: boolean;
  busy?: boolean;
  /** Replaces the bet button entirely — Crash swaps in "Cash out". */
  action?: React.ReactNode;
  /**
   * Server-returned balance. Supplied by games settled on the server, so the
   * panel shows the ledger's figure rather than the local session store.
   */
  serverBalance?: number | null;
}

const MULTIPLIERS = [0.5, 2] as const;

export function StakePanel({
  stake,
  onStakeChange,
  onBet,
  betLabel,
  children,
  summary = [],
  disabled = false,
  busy = false,
  action,
  serverBalance,
}: StakePanelProps) {
  const { t, locale } = useI18n();
  const hydrated = useHydrated();
  const ready = useCasinoReady();
  const localBalance = useGameStore((state) => state.balance);
  const balance = serverBalance ?? localBalance;

  const clamp = (value: number) =>
    round2(Math.min(GAME_STAKE.max, Math.max(0, value)));

  const commit = (raw: string) => {
    const parsed = Number.parseFloat(raw.replace(",", "."));
    onStakeChange(Number.isNaN(parsed) ? 0 : clamp(parsed));
  };

  const tooHigh = hydrated && stake > balance;
  const tooLow = stake > 0 && stake < GAME_STAKE.min;

  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-caption uppercase text-ink-subtle">
          {t("games.sessionBalance")}
        </h2>
        {hydrated ? (
          <p className="numeric text-h3 font-bold text-ink">
            {formatAmount(balance, locale)}
          </p>
        ) : (
          <Skeleton className="h-5 w-20" rounded="sm" />
        )}
      </div>

      {children ? <div className="mt-4 space-y-4">{children}</div> : null}

      <div className="mt-4">
        <label
          htmlFor="game-stake"
          className="mb-1.5 block text-small text-ink-muted"
        >
          {t("betslip.stake")}
        </label>

        <div className="flex gap-1.5">
          <div className="relative flex flex-1 items-center">
            <input
              id="game-stake"
              inputMode="decimal"
              autoComplete="off"
              value={stake === 0 ? "" : String(stake)}
              placeholder="0.00"
              onChange={(event) => commit(event.target.value)}
              aria-invalid={tooHigh || tooLow}
              className={cn(
                "numeric h-11 w-full rounded-md border bg-surface-2 pe-14 ps-3 text-h3 font-semibold text-ink transition-colors duration-fast placeholder:font-normal placeholder:text-ink-subtle hover:border-line-strong focus:border-primary",
                tooHigh || tooLow ? "border-danger" : "border-line",
              )}
            />
            <span className="pointer-events-none absolute end-3 text-small font-medium text-ink-subtle">
              {JURISDICTION.currency}
            </span>
          </div>

          {MULTIPLIERS.map((factor) => (
            <button
              key={factor}
              type="button"
              onClick={() => onStakeChange(clamp(stake * factor))}
              className="numeric h-11 w-11 shrink-0 cursor-pointer rounded-md border border-line bg-surface-2 text-small font-semibold text-ink-muted transition-colors duration-fast hover:border-line-strong hover:text-ink"
            >
              {factor === 0.5 ? "½" : "2×"}
            </button>
          ))}

          <button
            type="button"
            onClick={() => onStakeChange(clamp(balance))}
            className="h-11 shrink-0 cursor-pointer rounded-md border border-line bg-surface-2 px-2.5 text-caption font-semibold uppercase text-ink-muted transition-colors duration-fast hover:border-line-strong hover:text-ink"
          >
            {t("games.max")}
          </button>
        </div>

        {tooHigh ? (
          <p role="alert" className="mt-1.5 text-caption normal-case tracking-normal text-danger">
            {t("games.error.insufficientBalance")}
          </p>
        ) : tooLow ? (
          <p role="alert" className="mt-1.5 text-caption normal-case tracking-normal text-danger">
            {t("games.error.minStake", {
              amount: formatAmount(GAME_STAKE.min, locale),
            })}
          </p>
        ) : null}
      </div>

      {summary.length > 0 ? (
        <dl className="mt-4 space-y-1.5 border-t border-line-soft pt-3 text-small">
          {summary.map((row) => (
            <div key={row.label} className="flex items-baseline justify-between gap-3">
              <dt className={row.emphasis ? "font-semibold text-ink" : "text-ink-muted"}>
                {row.label}
              </dt>
              <dd
                className={cn(
                  "numeric font-semibold",
                  row.emphasis ? "text-primary" : "text-ink",
                )}
              >
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      <div className="mt-4">
        {action ?? (
          <Button
            fullWidth
            size="lg"
            // `!ready` shows the spinner rather than a dead disabled button:
            // the game is starting up, which is what a spinner means.
            loading={busy || !ready}
            disabled={!ready || disabled || tooHigh || tooLow || stake <= 0}
            onClick={onBet}
          >
            {betLabel}
          </Button>
        )}
      </div>
    </section>
  );
}
