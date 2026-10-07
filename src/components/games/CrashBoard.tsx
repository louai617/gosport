"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { formatAmount } from "@/lib/format";
import { floorTo2, round2 } from "@/lib/games/constants";
import { multiplierAt } from "@/lib/games/crash";
import { useI18n } from "@/i18n/I18nProvider";
import type { CrashView } from "@/types/casino";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { useWallet } from "@/components/wallet/WalletProvider";
import { StakePanel } from "./StakePanel";

/**
 * Crash.
 *
 * The bust point is drawn on the server, from the player's committed seed, when
 * the round starts — and it is never sent to the browser while the round is
 * running. This board animates the curve from the server's start time and asks
 * the server what happened:
 *
 *  - **Cash out** posts to the server, which evaluates the curve at *its own*
 *    clock. If the curve had already passed the bust point by the time the
 *    request landed, the round is a loss — that is the game.
 *  - While running, the board polls the server (every ~600 ms) so it learns the
 *    moment the round ends — a bust, or an auto cash-out the server honoured.
 *
 * Nothing the browser says about time or multipliers is believed.
 */
const POLL_MS = 600;

type Phase = "idle" | "running" | "busted" | "cashed";

export function CrashBoard() {
  const { t, locale } = useI18n();
  const { play, act, resume, ready, signedIn } = useWallet();

  const [stake, setStake] = useState(1);
  const [autoEnabled, setAutoEnabled] = useState(false);
  const [autoTarget, setAutoTarget] = useState(2);

  const [phase, setPhase] = useState<Phase>("idle");
  const [current, setCurrent] = useState(1);
  const [final, setFinal] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const roundId = useRef<string | null>(null);
  /** performance.now() corresponding to the curve's t = 0, corrected for clock skew. */
  const originRef = useRef(0);
  const frame = useRef<number | null>(null);
  const poller = useRef<number | null>(null);
  const ended = useRef(false);

  const stopTimers = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    if (poller.current !== null) window.clearInterval(poller.current);
    frame.current = null;
    poller.current = null;
  }, []);

  useEffect(() => stopTimers, [stopTimers]);

  const conclude = useCallback(
    (view: CrashView) => {
      if (ended.current) return;
      ended.current = true;
      stopTimers();
      if (view.phase === "busted") {
        setCurrent(view.crashPoint ?? 1);
        setFinal(view.crashPoint);
        setPhase("busted");
      } else {
        setCurrent(view.multiplier ?? 1);
        setFinal(view.multiplier);
        setPhase("cashed");
      }
    },
    [stopTimers],
  );

  const begin = useCallback(
    (view: CrashView, id: string) => {
      ended.current = false;
      roundId.current = id;
      setError(null);
      setFinal(null);
      // Align the local clock to the server's: it says how far into the curve it is *now*.
      originRef.current = performance.now() - (view.serverNow - view.startedAt);
      setPhase("running");

      const tick = () => {
        if (ended.current) return;
        setCurrent(multiplierAt(performance.now() - originRef.current));
        frame.current = requestAnimationFrame(tick);
      };
      frame.current = requestAnimationFrame(tick);

      poller.current = window.setInterval(async () => {
        const status = await resume<CrashView>("crash", id);
        if (status?.settled) conclude(status.result);
      }, POLL_MS);
    },
    [resume, conclude],
  );

  // A reload mid-round resumes it; the stake is not stranded.
  useEffect(() => {
    if (!ready || !signedIn) return;
    let cancelled = false;
    void resume<CrashView>("crash").then((open) => {
      if (!cancelled && open && !open.settled) begin(open.result, open.roundId);
    });
    return () => {
      cancelled = true;
    };
  }, [ready, signedIn, resume, begin]);

  const start = async () => {
    if (phase === "running" || busy) return;
    setBusy(true);
    setError(null);
    const response = await play<CrashView>("crash", {
      stake,
      ...(autoEnabled ? { autoCashOut: autoTarget } : {}),
    });
    setBusy(false);

    if (!response.ok || !response.result || !response.roundId) {
      setError(response.errorKey ?? "error.generic");
      return;
    }
    setCurrent(1);
    begin(response.result, response.roundId);
  };

  const cashOut = async () => {
    if (phase !== "running" || !roundId.current || ended.current) return;
    setBusy(true);
    const response = await act<CrashView>("crash", roundId.current, "cashout");
    setBusy(false);

    if (!response.ok || !response.result) {
      setError(response.errorKey ?? "error.generic");
      return;
    }
    conclude(response.result);
  };

  const running = phase === "running";
  const shown = running ? current : (final ?? current);

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
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 origin-bottom bg-gradient-to-t from-primary/25 to-transparent transition-[height] duration-100"
          style={{ height: `${Math.min(100, (Math.log(Math.max(shown, 1)) / Math.log(20)) * 100)}%` }}
        />

        <div className="relative text-center">
          {error ? (
            <Alert tone="danger">{t(error)}</Alert>
          ) : phase === "idle" ? (
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
                {floorTo2(shown).toFixed(2)}×
              </p>

              <p className="mt-3 text-small text-ink-muted">
                {phase === "busted"
                  ? t("games.crash.busted")
                  : phase === "cashed"
                    ? t("games.crash.cashedAt", { multiplier: floorTo2(shown).toFixed(2) })
                    : t("games.crash.rising")}
              </p>
            </>
          )}
        </div>
      </section>

      <StakePanel
        stake={stake}
        onStakeChange={setStake}
        onBet={start}
        busy={busy}
        disabled={running}
        betLabel={t("games.crash.play")}
        action={
          running ? (
            <Button fullWidth size="lg" variant="success" loading={busy} onClick={cashOut}>
              {t("games.crash.cashOut", {
                amount: formatAmount(round2(stake * current), locale),
              })}
            </Button>
          ) : undefined
        }
        summary={[
          {
            label: t("games.payout"),
            value: formatAmount(round2(stake * (running ? current : autoEnabled ? autoTarget : 1)), locale),
            emphasis: true,
          },
        ]}
      >
        <div className="space-y-2.5">
          <Checkbox
            checked={autoEnabled}
            disabled={running}
            onChange={(event) => setAutoEnabled(event.target.checked)}
            label={t("games.crash.autoCashOut")}
          />

          <input
            inputMode="decimal"
            disabled={!autoEnabled || running}
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
