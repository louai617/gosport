"use client";

import { useCallback, useState } from "react";
import { Bomb, Gem } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatAmount } from "@/lib/format";
import { round2 } from "@/lib/games/constants";
import {
  MAX_MINES,
  MIN_MINES,
  TILE_COUNT,
  minesMultiplier,
  minePositions,
  nextTileSafeChance,
} from "@/lib/games/mines";
import { useI18n } from "@/i18n/I18nProvider";
import { useGameStore } from "@/store/gameStore";
import { Button } from "@/components/ui/Button";
import { StakePanel } from "./StakePanel";
import { useGameRound, type BeginResult } from "./useGameRound";

type Phase = "idle" | "playing" | "busted" | "cashed";

/**
 * Mines.
 *
 * Bombs are placed by shuffling all 25 tiles from the committed seed and
 * taking the first `mineCount` — so the board is fixed before the first click
 * and cannot shift under the player. The grid stays keyboard-operable: every
 * tile is a real button, and the revealed board is announced on settlement.
 */
export function MinesBoard() {
  const { t, locale } = useI18n();
  const { begin, drawShuffle, settle } = useGameRound();
  const setBusy = useGameStore((state) => state.setBusy);

  const [stake, setStake] = useState(1);
  const [mineCount, setMineCount] = useState(3);
  const [phase, setPhase] = useState<Phase>("idle");
  const [mines, setMines] = useState<Set<number>>(new Set());
  const [revealed, setRevealed] = useState<number[]>([]);
  const [exploded, setExploded] = useState<number | null>(null);
  const [round, setRound] = useState<BeginResult | null>(null);

  const playing = phase === "playing";
  const settledCount = revealed.length;
  const current = minesMultiplier(mineCount, settledCount);
  const next = minesMultiplier(mineCount, settledCount + 1);
  const safeChance = nextTileSafeChance(mineCount, settledCount);

  const start = async () => {
    const started = begin(stake);
    if (!started) return;

    setBusy(true);
    const shuffled = await drawShuffle(started, TILE_COUNT);

    setMines(minePositions(shuffled, mineCount));
    setRevealed([]);
    setExploded(null);
    setRound(started);
    setPhase("playing");
    setBusy(false);
  };

  const cashOut = useCallback(() => {
    if (!playing || !round || settledCount === 0) return;

    settle({
      gameKey: "mines",
      stake,
      multiplier: current,
      result: settledCount,
      outcome: "cashed_out",
      round,
    });
    setPhase("cashed");
  }, [playing, round, settledCount, settle, stake, current]);

  const reveal = (index: number) => {
    if (!playing || revealed.includes(index) || !round) return;

    if (mines.has(index)) {
      setExploded(index);
      setPhase("busted");
      settle({
        gameKey: "mines",
        stake,
        multiplier: 0,
        result: revealed.length,
        outcome: "lost",
        round,
      });
      return;
    }

    const nextRevealed = [...revealed, index];
    setRevealed(nextRevealed);

    // Clearing every safe tile ends the round at the top of the ladder;
    // leaving it "playing" would offer a cash-out with nothing left to risk.
    if (nextRevealed.length === TILE_COUNT - mineCount) {
      settle({
        gameKey: "mines",
        stake,
        multiplier: minesMultiplier(mineCount, nextRevealed.length),
        result: nextRevealed.length,
        outcome: "won",
        round,
      });
      setPhase("cashed");
    }
  };

  const finished = phase === "busted" || phase === "cashed";

  return (
    <>
      <section className="rounded-xl border border-line bg-surface p-4 sm:p-5">
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
                disabled={!playing || isRevealed}
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
            : phase === "cashed"
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
                    amount: formatAmount(round2(stake * current), locale),
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
              round2(stake * (settledCount > 0 ? current : next)),
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
