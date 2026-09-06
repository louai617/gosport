import type { DiceDirection } from "@/types/games";
import { BASE_RTP, floorTo2, round2 } from "./constants";

/**
 * Dice.
 *
 * A roll of 0.00–99.99, uniform over exactly 10 000 outcomes. Working in
 * hundredths as integers keeps the win-chance count exact: deriving the
 * probability from a float would be off by a hundredth at the boundaries, and
 * a multiplier built on a wrong probability is a wrong house edge.
 */

export const DICE_STEPS = 10_000;
export const DICE_MIN_TARGET = 2;
export const DICE_MAX_TARGET = 98;

/** Float in [0,1) → a roll in [0.00, 99.99]. */
export function rollFromFloat(value: number): number {
  return Math.floor(value * DICE_STEPS) / 100;
}

/** Exact count of winning outcomes, so the quoted chance is not an estimate. */
export function winningOutcomes(target: number, direction: DiceDirection): number {
  const threshold = Math.round(target * 100);
  return direction === "under"
    ? threshold // rolls 0 .. threshold-1
    : DICE_STEPS - 1 - threshold; // rolls threshold+1 .. 9999
}

export function winChance(target: number, direction: DiceDirection): number {
  return winningOutcomes(target, direction) / DICE_STEPS;
}

export function diceMultiplier(target: number, direction: DiceDirection): number {
  const chance = winChance(target, direction);
  if (chance <= 0) return 0;
  return floorTo2(BASE_RTP / chance);
}

/** Inverse: the target that yields a wanted multiplier, for the payout input. */
export function targetForMultiplier(
  multiplier: number,
  direction: DiceDirection,
): number {
  const chance = BASE_RTP / Math.max(multiplier, 1.0102);
  const target = direction === "under" ? chance * 100 : 100 - chance * 100;
  return Math.min(DICE_MAX_TARGET, Math.max(DICE_MIN_TARGET, round2(target)));
}

export interface DiceResult {
  roll: number;
  won: boolean;
  multiplier: number;
  chance: number;
}

export function settleDice(
  value: number,
  target: number,
  direction: DiceDirection,
): DiceResult {
  const roll = rollFromFloat(value);
  const won = direction === "under" ? roll < target : roll > target;

  return {
    roll,
    won,
    multiplier: diceMultiplier(target, direction),
    chance: winChance(target, direction),
  };
}
