"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { formatAmount } from "@/lib/format";
import {
  DICE_MAX_TARGET,
  DICE_MIN_TARGET,
  diceMultiplier,
  settleDice,
  winChance,
} from "@/lib/games/dice";
import { round2 } from "@/lib/games/constants";
import { useI18n } from "@/i18n/I18nProvider";
import { useGameStore } from "@/store/gameStore";
import type { DiceDirection } from "@/types/games";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { StakePanel } from "./StakePanel";
import { useGameRound } from "./useGameRound";

/**
 * Dice.
 *
 * The track is the whole interface: the win band is coloured, the target is a
 * range input sitting on it, and the last roll lands as a marker. A player can
 * read their edge without reading a number.
 */
export function DiceBoard() {
  const { t, locale } = useI18n();
  const { begin, draw, settle } = useGameRound();
  const busy = useGameStore((state) => state.busy);
  const setBusy = useGameStore((state) => state.setBusy);

  const [stake, setStake] = useState(1);
  const [target, setTarget] = useState(50);
  const [direction, setDirection] = useState<DiceDirection>("under");
  const [roll, setRoll] = useState<number | null>(null);
  const [won, setWon] = useState<boolean | null>(null);

  const chance = winChance(target, direction);
  const multiplier = diceMultiplier(target, direction);

  const play = async () => {
    const round = begin(stake);
    if (!round) return;

    setBusy(true);
    const [value] = await draw(round, 1);
    const result = settleDice(value ?? 0, target, direction);

    setRoll(result.roll);
    setWon(result.won);
    settle({
      gameKey: "dice",
      stake,
      multiplier: result.won ? result.multiplier : 0,
      result: result.roll,
      outcome: result.won ? "won" : "lost",
      round,
    });
    setBusy(false);
  };

  // The win band always starts at one end of the track, so its width is the
  // win chance and no separate legend is needed.
  const bandWidth = `${chance * 100}%`;

  return (
    <>
      <section className="rounded-xl border border-line bg-surface p-5 sm:p-6">
        <div className="flex min-h-24 items-center justify-center">
          {roll === null ? (
            <p className="text-small text-ink-subtle">{t("games.dice.prompt")}</p>
          ) : (
            <p
              dir="ltr"
              className={cn(
                "numeric text-display font-bold tabular-nums transition-colors duration-base",
                won ? "text-success" : "text-danger",
              )}
            >
              {roll.toFixed(2)}
            </p>
          )}
        </div>

        <div className="relative mt-6 pb-8">
          <div className="relative h-3 rounded-full bg-danger/25">
            <div
              className="absolute inset-y-0 rounded-full bg-success/70 transition-[width] duration-base ease-out-quint"
              style={
                direction === "under"
                  ? { insetInlineStart: 0, width: bandWidth }
                  : { insetInlineEnd: 0, width: bandWidth }
              }
            />

            {roll !== null ? (
              <span
                aria-hidden="true"
                className={cn(
                  "absolute top-1/2 size-5 -translate-y-1/2 rounded-full border-2 shadow-e2 transition-[inset-inline-start] duration-slow ease-out-quint",
                  won ? "border-success bg-canvas" : "border-danger bg-canvas",
                )}
                style={{ insetInlineStart: `calc(${roll}% - 10px)` }}
              />
            ) : null}
          </div>

          <input
            type="range"
            min={DICE_MIN_TARGET}
            max={DICE_MAX_TARGET}
            step={0.01}
            value={target}
            onChange={(event) => setTarget(round2(Number(event.target.value)))}
            aria-label={t("games.dice.target")}
            aria-valuetext={`${target.toFixed(2)}`}
            className="absolute inset-x-0 top-0 h-3 w-full cursor-pointer appearance-none bg-transparent
              [&::-webkit-slider-thumb]:h-7 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none
              [&::-webkit-slider-thumb]:rounded-sm [&::-webkit-slider-thumb]:border-2
              [&::-webkit-slider-thumb]:border-canvas [&::-webkit-slider-thumb]:bg-primary
              [&::-moz-range-thumb]:h-7 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-sm
              [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-canvas [&::-moz-range-thumb]:bg-primary"
          />

          <div
            dir="ltr"
            className="numeric absolute inset-x-0 bottom-0 flex justify-between text-caption text-ink-subtle"
          >
            {[0, 25, 50, 75, 100].map((tick) => (
              <span key={tick}>{tick}</span>
            ))}
          </div>
        </div>
      </section>

      <StakePanel
        stake={stake}
        onStakeChange={setStake}
        onBet={play}
        busy={busy}
        betLabel={t("games.dice.roll")}
        summary={[
          { label: t("games.chance"), value: `${(chance * 100).toFixed(2)}%` },
          { label: t("games.multiplier"), value: `${multiplier.toFixed(2)}×` },
          {
            label: t("games.payout"),
            value: formatAmount(round2(stake * multiplier), locale),
            emphasis: true,
          },
        ]}
      >
        <SegmentedControl
          aria-label={t("games.dice.direction")}
          value={direction}
          onChange={(value) => setDirection(value as DiceDirection)}
          options={[
            { value: "under", label: t("games.dice.under") },
            { value: "over", label: t("games.dice.over") },
          ]}
        />

        <div>
          <label
            htmlFor="dice-target"
            className="mb-1.5 block text-small text-ink-muted"
          >
            {t("games.dice.target")}
          </label>
          <input
            id="dice-target"
            inputMode="decimal"
            value={target}
            onChange={(event) => {
              const parsed = Number.parseFloat(event.target.value);
              if (Number.isNaN(parsed)) return;
              setTarget(
                round2(Math.min(DICE_MAX_TARGET, Math.max(DICE_MIN_TARGET, parsed))),
              );
            }}
            className="numeric h-10 w-full rounded-md border border-line bg-surface-2 px-3 text-small font-semibold text-ink transition-colors duration-fast hover:border-line-strong focus:border-primary"
          />
        </div>
      </StakePanel>
    </>
  );
}
