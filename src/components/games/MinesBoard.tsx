"use client";

import { useCallback, useEffect, useState } from "react";
import { Bomb, Gem } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatAmount } from "@/lib/format";
import { round2 } from "@/lib/games/constants";
import {
  MAX_MINES,
  MIN_MINES,
  TILE_COUNT,
  minesMultiplier,
  nextTileSafeChance,
} from "@/lib/games/mines";
import { useI18n } from "@/i18n/I18nProvider";
import type { MinesView } from "@/types/casino";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { useWallet } from "@/components/wallet/WalletProvider";
import { StakePanel } from "./StakePanel";

/**
 * Mines.
 *
 * The board is fixed on the server when the round starts — all 25 tiles are
 * shuffled from the committed seed and the first `mineCount` are bombs — and the
 * browser is never told where they are until the round ends. Every reveal and
 * the cash-out are requests the server answers; this component only paints the
 * result. The grid stays keyboard-operable: every tile is a real button.
 */
export function MinesBoard() {
  const { t, locale } = useI18n();
  const { play, act, resume, ready, signedIn } = useWallet();

  const [stake, setStake] = useState(1);
  const [mineCount, setMineCount] = useState(3);
  const [view, setView] = useState<MinesView | null>(null);
  const [roundId, setRoundId] = useState<string | null>(null);
  const [roundStake, setRoundStake] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A reload mid-round resumes it; the stake is not stranded.
  useEffect(() => {
    if (!ready || !signedIn) return;
    let cancelled = false;
    void resume<MinesView>("mines").then((open) => {
      if (cancelled || !open || open.settled) return;
      setView(open.result);
      setRoundId(open.roundId);
      setMineCount(open.result.mineCount);
    });
    return () => {
      cancelled = true;
    };
  }, [ready, signedIn, resume]);

  const playing = view?.phase === "playing";
  const revealed = view?.revealed ?? [];
  const settledCount = revealed.length;
  const activeMines = view?.mineCount ?? mineCount;
  const current = minesMultiplier(activeMines, settledCount);
  const next = minesMultiplier(activeMines, settledCount + 1);
  const safeChance = nextTileSafeChance(activeMines, settledCount);
  const finished = view !== null && view.phase !== "playing";
  const phase = view?.phase ?? "idle";

  const start = async () => {
    setBusy(true);
    setError(null);
    const response = await play<MinesView>("mines", { stake, mineCount });
    setBusy(false);
    if (!response.ok || !response.result || !response.roundId) {
      setError(response.errorKey ?? "error.generic");
      return;
    }
    setView(response.result);
    setRoundId(response.roundId);
    setRoundStake(stake);
  };

  const send = useCallback(
    async (action: "reveal" | "cashout", tile?: number) => {
      if (!roundId || busy) return;
      setBusy(true);
      setError(null);
      const response = await act<MinesView>("mines", roundId, action, tile === undefined ? {} : { tile });
      setBusy(false);
      if (!response.ok || !response.result) {
        setError(response.errorKey ?? "error.generic");
        return;
      }
      setView(response.result);
    },
    [act, roundId, busy],
  );

  const reveal = (index: number) => {
    if (!playing || revealed.includes(index)) return;
    void send("reveal", index);
  };

  const cashOut = () => {
    if (!playing || settledCount === 0) return;
    void send("cashout");
  };

  const mines = new Set(view?.mines ?? []);
  const exploded = view?.exploded ?? null;

  return (
    <>
      <section className="rounded-xl border border-line bg-surface p-4 sm:p-5">
        {error ? (
          <Alert tone="danger" className="mb-4">
            {t(error)}
          </Alert>
        ) : null}
        <div
          role="grid"
          aria-label={t("games.mines.board")}
          className="mx-auto grid max-w-md grid-cols-5 gap-1.5 sm:gap-2"
        >
          {Array.from({ length: TILE_COUNT }, (_, index) => {
            const isRevealed = revealed.includes(index);
            const isMine = mines.has(index);
            const show = isRevealed || (finished && isMine);

            return (
              <button
                key={index}
                type="button"
                role="gridcell"
                disabled={!playing || isRevealed || busy}
                onClick={() => reveal(index)}
                aria-label={t("games.mines.tile", { index: index + 1 })}
                className={cn(
                  "grid aspect-square place-items-center rounded-lg border transition-[transform,background-color,border-color] duration-base",
                  playing && !isRevealed
                    ? "cursor-pointer border-line bg-surface-2 hover:-translate-y-0.5 hover:border-line-strong hover:bg-surface-3"
                    : "cursor-default",
                  isRevealed && "border-success/40 bg-success-soft animate-pop",
                  finished && isMine && !isRevealed && "border-danger/40 bg-danger-soft/60",
                  index === exploded && "border-danger bg-danger-soft",
                  !playing && !show && "border-line-soft bg-surface-2/40",
                )}
              >
                {isRevealed ? (
                  <Gem size={18} aria-hidden="true" className="text-success" />
                ) : show ? (
                  <Bomb
                    size={18}
                    aria-hidden="true"
                    className={index === exploded ? "text-danger" : "text-danger/60"}
                  />
                ) : null}
              </button>
            );
          })}
        </div>

        <p role="status" aria-live="polite" className="sr-only">
          {phase === "busted"
            ? t("games.mines.busted")
            : phase === "cashed" || phase === "cleared"
              ? t("games.mines.cashed", { multiplier: current.toFixed(2) })
              : ""}
        </p>

        {playing && settledCount > 0 ? (
          <p className="mt-4 text-center text-small text-ink-muted">
            {t("games.mines.next", {
              multiplier: next.toFixed(2),
              chance: (safeChance * 100).toFixed(1),
            })}
          </p>
        ) : null}
      </section>

      <StakePanel
        stake={stake}
        onStakeChange={setStake}
        onBet={start}
        busy={busy}
        disabled={playing}
        betLabel={t("games.mines.play")}
        action={
          playing ? (
            <Button
              fullWidth
              size="lg"
              variant="success"
              disabled={settledCount === 0}
              onClick={cashOut}
            >
              {settledCount === 0
                ? t("games.mines.pickOne")
                : t("games.crash.cashOut", {
                    amount: formatAmount(round2((roundStake || stake) * current), locale),
                  })}
            </Button>
          ) : undefined
        }
        summary={[
          { label: t("games.mines.revealed"), value: String(settledCount) },
          {
            label: t("games.multiplier"),
            value: `${(settledCount > 0 ? current : next).toFixed(2)}×`,
          },
          {
            label: t("games.payout"),
            value: formatAmount(
              round2((playing ? roundStake || stake : stake) * (settledCount > 0 ? current : next)),
              locale,
            ),
            emphasis: true,
          },
        ]}
      >
        <div>
          <label
            htmlFor="mine-count"
            className="mb-1.5 flex items-baseline justify-between text-small text-ink-muted"
          >
            {t("games.mines.count")}
            <span className="numeric font-semibold text-ink">{mineCount}</span>
          </label>
          <input
            id="mine-count"
            type="range"
            min={MIN_MINES}
            max={MAX_MINES}
            step={1}
            value={mineCount}
            disabled={playing}
            onChange={(event) => setMineCount(Number(event.target.value))}
            className="h-2 w-full cursor-pointer appearance-none rounded-full bg-surface-3 disabled:opacity-50
              [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none
              [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary
              [&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:rounded-full
              [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-primary"
          />
        </div>
      </StakePanel>
    </>
  );
}
