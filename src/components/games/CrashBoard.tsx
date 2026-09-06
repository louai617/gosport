"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { formatAmount } from "@/lib/format";
import { floorTo2, round2 } from "@/lib/games/constants";
import { multiplierFromFloat } from "@/lib/games/limbo";
import { useI18n } from "@/i18n/I18nProvider";
import { useGameStore } from "@/store/gameStore";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { StakePanel } from "./StakePanel";
import { useGameRound, type BeginResult } from "./useGameRound";

/**
 * Crash.
 *
 * Same distribution as Limbo — the bust point is drawn once, up front, from
 * the committed seed. The rising curve is presentation: nothing about it can
 * change where the round ends, which is what makes the result verifiable.
 *
 * `m(t) = e^{rate·t}` because a linear climb makes every round feel identical;
 * exponential growth means the decision to hold gets harder the longer it
 * runs, which is the shape of the game.
 */
const GROWTH_RATE = 0.18;

type Phase = "idle" | "running" | "busted" | "cashed";

function multiplierAt(elapsedMs: number): number {
  return floorTo2(Math.exp(GROWTH_RATE * (elapsedMs / 1000)));
}

export function CrashBoard() {
  const { t, locale } = useI18n();
  const { begin, draw, settle } = useGameRound();
  const setBusy = useGameStore((state) => state.setBusy);

  const [stake, setStake] = useState(1);
  const [autoEnabled, setAutoEnabled] = useState(false);
  const [autoTarget, setAutoTarget] = useState(2);

  const [phase, setPhase] = useState<Phase>("idle");
  const [current, setCurrent] = useState(1);
  const [bustPoint, setBustPoint] = useState<number | null>(null);
  const [cashedAt, setCashedAt] = useState<number | null>(null);

  // Refs, not state: the animation frame reads these every ~16ms and a stale
  // closure here would keep the round running past its bust point.
  const frameRef = useRef<number | null>(null);
  const startedRef = useRef(0);
  const bustRef = useRef(0);
  const roundRef = useRef<BeginResult | null>(null);
  const stakeRef = useRef(stake);
  const autoRef = useRef<number | null>(null);
  const settledRef = useRef(false);

  const stop = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
  }, []);

  // A round left running while the component unmounts would keep an rAF loop
  // alive and settle into a store the user has navigated away from.
  useEffect(() => stop, [stop]);

  const finish = useCallback(
    (multiplier: number, outcome: "won" | "lost") => {
      if (settledRef.current) return;
      settledRef.current = true;
      stop();

      const round = roundRef.current;
      if (!round) return;

      settle({
        gameKey: "crash",
        stake: stakeRef.current,
        multiplier: outcome === "won" ? multiplier : 0,
        result: bustRef.current,
        outcome: outcome === "won" ? "cashed_out" : "lost",
        round,
      });
      setBusy(false);
    },
    [settle, setBusy, stop],
  );

  const cashOut = useCallback(() => {
    if (phase !== "running" || settledRef.current) return;
    const now = multiplierAt(performance.now() - startedRef.current);
    const capped = Math.min(now, bustRef.current);

    setCashedAt(capped);
    setCurrent(capped);
    setPhase("cashed");
    finish(capped, "won");
  }, [phase, finish]);

  const tick = useCallback(() => {
    const elapsed = performance.now() - startedRef.current;
    const value = multiplierAt(elapsed);

    if (value >= bustRef.current) {
      setCurrent(bustRef.current);
      setPhase("busted");
      finish(0, "lost");
      return;
    }

    // Auto cash-out is evaluated before the next paint, so it cannot be beaten
    // to the punch by a bust in the same frame.
    const auto = autoRef.current;
    if (auto !== null && value >= auto) {
      const capped = Math.min(auto, bustRef.current);
      setCashedAt(capped);
      setCurrent(capped);
      setPhase("cashed");
      finish(capped, "won");
      return;
    }

    setCurrent(value);
    frameRef.current = requestAnimationFrame(tick);
  }, [finish]);

  const play = async () => {
    if (phase === "running") return;

    const round = begin(stake);
    if (!round) return;

    setBusy(true);
    const [value] = await draw(round, 1);
    const point = multiplierFromFloat(value ?? 0);

    roundRef.current = round;
    stakeRef.current = stake;
    bustRef.current = point;
    autoRef.current = autoEnabled ? autoTarget : null;
    settledRef.current = false;
    startedRef.current = performance.now();

    setBustPoint(point);
    setCashedAt(null);
    setCurrent(1);
    setPhase("running");
    frameRef.current = requestAnimationFrame(tick);
  };

  const running = phase === "running";
  const shown = running ? current : (cashedAt ?? bustPoint ?? current);

  return (
    <>
      <section
        className={cn(
          "relative grid min-h-64 place-items-center overflow-hidden rounded-xl border p-6 transition-colors duration-base",
          phase === "busted"
            ? "border-danger/40 bg-danger-soft/25"
            : phase === "cashed"
              ? "border-success/40 bg-success-soft/25"
              : "border-line bg-surface",
        )}
      >
        {/* The curve is drawn as a growing bar rather than a plotted line: it
            reads at a glance on a phone and needs no canvas. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 origin-bottom bg-gradient-to-t from-primary/25 to-transparent transition-[height] duration-100"
          style={{ height: `${Math.min(100, (Math.log(shown) / Math.log(20)) * 100)}%` }}
        />

        <div className="relative text-center">
          {phase === "idle" ? (
            <p className="text-small text-ink-subtle">{t("games.crash.prompt")}</p>
          ) : (
            <>
              <p
                dir="ltr"
                role="status"
                aria-live={running ? "off" : "polite"}
                className={cn(
                  "numeric text-[clamp(2.5rem,12vw,5rem)] font-bold leading-none tabular-nums",
                  phase === "busted" && "text-danger",
                  phase === "cashed" && "text-success animate-pop",
                  running && "text-ink",
                )}
              >
                {shown.toFixed(2)}×
              </p>

              <p className="mt-3 text-small text-ink-muted">
                {phase === "busted"
                  ? t("games.crash.busted")
                  : phase === "cashed"
                    ? t("games.crash.cashedAt", { multiplier: shown.toFixed(2) })
                    : t("games.crash.rising")}
              </p>
            </>
          )}
        </div>
      </section>

      <StakePanel
        stake={stake}
        onStakeChange={setStake}
        onBet={play}
        disabled={running}
        betLabel={t("games.crash.play")}
        action={
          running ? (
            <Button fullWidth size="lg" variant="success" onClick={cashOut}>
              {t("games.crash.cashOut", {
                amount: formatAmount(round2(stake * current), locale),
              })}
            </Button>
          ) : undefined
        }
        summary={[
          {
            label: t("games.payout"),
            value: formatAmount(round2(stake * (running ? current : autoTarget)), locale),
            emphasis: true,
          },
        ]}
      >
        <div className="space-y-2.5">
          <Checkbox
            checked={autoEnabled}
            onChange={(event) => setAutoEnabled(event.target.checked)}
            label={t("games.crash.autoCashOut")}
          />

          <input
            inputMode="decimal"
            disabled={!autoEnabled}
            value={autoTarget}
            onChange={(event) => {
              const parsed = Number.parseFloat(event.target.value);
              if (!Number.isNaN(parsed)) setAutoTarget(round2(Math.max(1.01, parsed)));
            }}
            aria-label={t("games.crash.autoCashOut")}
            className="numeric h-10 w-full rounded-md border border-line bg-surface-2 px-3 text-small font-semibold text-ink transition-colors duration-fast hover:border-line-strong focus:border-primary disabled:opacity-50"
          />
        </div>
      </StakePanel>
    </>
  );
}
