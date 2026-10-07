"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { PlinkoRisk } from "@/types/games";
import { cn } from "@/lib/cn";
import { formatAmount } from "@/lib/format";
import { round2 } from "@/lib/games/constants";
import { PLINKO_ROWS, buildPlinkoTable, type PlinkoDrop } from "@/lib/games/plinko";
import { useI18n } from "@/i18n/I18nProvider";
import { useWallet } from "@/components/wallet/WalletProvider";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { StakePanel } from "./StakePanel";

const STEP_MS = 90;

/**
 * Plinko.
 *
 * The whole path is drawn from the seed before the ball moves; the animation
 * replays a decided result rather than producing one. Bucket colour is derived
 * from the multiplier, so a table change needs no palette edit.
 */
export function PlinkoBoard() {
  const { t, locale } = useI18n();
  const { balance, ready, play } = useWallet();
  const [error, setError] = useState<string | null>(null);

  const [stake, setStake] = useState(1);
  const [rows, setRows] = useState<number>(12);
  const [risk, setRisk] = useState<PlinkoRisk>("medium");

  const [path, setPath] = useState<boolean[] | null>(null);
  const [step, setStep] = useState(0);
  const [landed, setLanded] = useState<number | null>(null);
  const timerRef = useRef<number | null>(null);

  const table = useMemo(() => buildPlinkoTable(rows, risk), [rows, risk]);

  const animate = useCallback(
    (dropped: PlinkoDrop, onDone: () => void) => {
      let index = 0;
      setStep(0);

      const advance = () => {
        index += 1;
        setStep(index);
        if (index >= dropped.path.length) {
          setLanded(dropped.bucket);
          onDone();
          return;
        }
        timerRef.current = window.setTimeout(advance, STEP_MS);
      };

      timerRef.current = window.setTimeout(advance, STEP_MS);
    },
    [],
  );

  const drop = async () => {
    setLanded(null);
    if (timerRef.current) window.clearTimeout(timerRef.current);

    const response = await play<PlinkoDrop>("plinko", { stake, rows, risk });
    if (!response.ok || !response.result) {
      setError(response.errorKey ?? "error.generic");
      return;
    }
    setError(null);

    // The bucket is already settled server-side; the ball is only catching up.
    const dropped = response.result;
    setPath(dropped.path);
    animate(dropped, () => undefined);
  };

  // Position of the ball after `step` deflections, as a 0-1 fraction across
  // the board — the count of rights over the rows travelled so far.
  const travelled = path?.slice(0, step) ?? [];
  const rights = travelled.filter(Boolean).length;
  const ballX = step === 0 ? 0.5 : (rights + (rows - step) / 2) / rows;

  const maxMultiplier = Math.max(...table.multipliers);

  return (
    <>
      <section className="rounded-xl border border-line bg-surface p-4 sm:p-5">
        <div className="relative mx-auto max-w-lg">
          {/* Pegs */}
          <div className="flex flex-col items-center gap-1.5 py-2">
            {Array.from({ length: rows }, (_, row) => (
              <div key={row} className="flex justify-center gap-1.5">
                {Array.from({ length: row + 2 }, (_, peg) => (
                  <span
                    key={peg}
                    aria-hidden="true"
                    className={cn(
                      "size-1.5 rounded-full transition-colors duration-fast",
                      step === row + 1 ? "bg-primary" : "bg-line-strong",
                    )}
                  />
                ))}
              </div>
            ))}
          </div>

          {/* The ball tracks the decided path; it never decides anything. */}
          {path ? (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute size-3 rounded-full bg-primary shadow-e2 transition-all"
              style={{
                insetInlineStart: `calc(${ballX * 100}% - 6px)`,
                top: `${(step / rows) * 100}%`,
                transitionDuration: `${STEP_MS}ms`,
              }}
            />
          ) : null}
        </div>

        {/* Buckets */}
        <div dir="ltr" className="mt-3 flex gap-0.5">
          {table.multipliers.map((multiplier, index) => {
            const intensity = Math.min(1, Math.log(multiplier + 1) / Math.log(maxMultiplier + 1));
            return (
              <span
                key={index}
                className={cn(
                  "numeric flex h-8 flex-1 items-center justify-center rounded-sm text-[10px] font-bold tabular-nums transition-transform duration-base",
                  landed === index && "scale-110 ring-2 ring-ink",
                )}
                style={{
                  backgroundColor: `oklch(${0.32 + intensity * 0.24} ${0.06 + intensity * 0.13} ${60 - intensity * 55})`,
                  color: intensity > 0.55 ? "#0a0a0a" : "#f5f5f4",
                }}
              >
                {multiplier < 10 ? multiplier.toFixed(2) : multiplier}
              </span>
            );
          })}
        </div>

        <p className="mt-3 text-center text-caption normal-case tracking-normal text-ink-subtle">
          {t("games.plinko.tableRtp", { value: (table.actualRtp * 100).toFixed(2) })}
        </p>
      </section>

      <StakePanel
        stake={stake}
        onStakeChange={setStake}
        onBet={drop}
        betLabel={t("games.plinko.drop")}
        busy={!ready}
        summary={[
          { label: t("games.plinko.maxWin"), value: `${maxMultiplier}×` },
          {
            label: t("games.payout"),
            value: formatAmount(round2(stake * maxMultiplier), locale),
            emphasis: true,
          },
        ]}
      >
        <SegmentedControl
          aria-label={t("games.plinko.risk")}
          value={risk}
          onChange={(value) => setRisk(value as PlinkoRisk)}
          options={[
            { value: "low", label: t("games.plinko.low") },
            { value: "medium", label: t("games.plinko.medium") },
            { value: "high", label: t("games.plinko.high") },
          ]}
        />

        <SegmentedControl
          aria-label={t("games.plinko.rows")}
          value={String(rows)}
          onChange={(value) => setRows(Number(value))}
          options={PLINKO_ROWS.map((count) => ({
            value: String(count),
            label: String(count),
          }))}
        />
      </StakePanel>
    </>
  );
}
