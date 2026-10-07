"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { formatAmount } from "@/lib/format";
import { round2 } from "@/lib/games/constants";
import { chanceOfReaching } from "@/lib/games/limbo";
import { useI18n } from "@/i18n/I18nProvider";
import type { LimboPlayResult } from "@/types/casino";
import { Alert } from "@/components/ui/Alert";
import { useWallet } from "@/components/wallet/WalletProvider";
import { StakePanel } from "./StakePanel";

const MIN_TARGET = 1.01;
const MAX_TARGET = 1_000_000;

/** Limbo: pick a multiplier, win if the draw reaches it. */
export function LimboBoard() {
  const { t, locale } = useI18n();
  const { play: placeBet } = useWallet();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [stake, setStake] = useState(1);
  const [target, setTarget] = useState(2);
  const [result, setResult] = useState<number | null>(null);
  const [won, setWon] = useState<boolean | null>(null);

  const chance = chanceOfReaching(target);

  const play = async () => {
    setBusy(true);
    setError(null);
    const response = await placeBet<LimboPlayResult>("limbo", { stake, target });
    setBusy(false);

    if (!response.ok || !response.result) {
      setError(response.errorKey ?? "error.generic");
      return;
    }
    setResult(response.result.result);
    setWon(response.result.won);
  };

  return (
    <>
      <section className="grid min-h-64 place-items-center rounded-xl border border-line bg-surface p-6">
        {error ? <Alert tone="danger">{t(error)}</Alert> : result === null ? (
          <p className="text-small text-ink-subtle">{t("games.limbo.prompt")}</p>
        ) : (
          <div className="text-center">
            <p
              dir="ltr"
              className={cn(
                "numeric text-[clamp(2.5rem,12vw,5rem)] font-bold leading-none tabular-nums animate-pop",
                won ? "text-success" : "text-danger",
              )}
            >
              {result.toFixed(2)}×
            </p>
            <p className="mt-3 text-small text-ink-muted">
              {t("games.limbo.targetWas", { target: target.toFixed(2) })}
            </p>
          </div>
        )}
      </section>

      <StakePanel
        stake={stake}
        onStakeChange={setStake}
        onBet={play}
        busy={busy}
        betLabel={t("games.limbo.play")}
        summary={[
          { label: t("games.chance"), value: `${(chance * 100).toFixed(4)}%` },
          {
            label: t("games.payout"),
            value: formatAmount(round2(stake * target), locale),
            emphasis: true,
          },
        ]}
      >
        <div>
          <label
            htmlFor="limbo-target"
            className="mb-1.5 block text-small text-ink-muted"
          >
            {t("games.limbo.target")}
          </label>
          <div className="relative flex items-center">
            <input
              id="limbo-target"
              inputMode="decimal"
              value={target}
              onChange={(event) => {
                const parsed = Number.parseFloat(event.target.value);
                if (Number.isNaN(parsed)) return;
                setTarget(round2(Math.min(MAX_TARGET, Math.max(MIN_TARGET, parsed))));
              }}
              className="numeric h-10 w-full rounded-md border border-line bg-surface-2 pe-8 ps-3 text-small font-semibold text-ink transition-colors duration-fast hover:border-line-strong focus:border-primary"
            />
            <span className="pointer-events-none absolute end-3 text-small text-ink-subtle">
              ×
            </span>
          </div>

          <div className="mt-2 flex gap-1.5">
            {[1.5, 2, 5, 10, 100].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setTarget(preset)}
                className={cn(
                  "numeric h-7 flex-1 cursor-pointer rounded-md border text-caption font-semibold transition-colors duration-fast",
                  target === preset
                    ? "border-primary bg-primary-soft text-primary"
                    : "border-line bg-surface-2 text-ink-muted hover:border-line-strong hover:text-ink",
                )}
              >
                {preset}×
              </button>
            ))}
          </div>
        </div>
      </StakePanel>
    </>
  );
}
