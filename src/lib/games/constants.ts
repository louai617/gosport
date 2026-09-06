/**
 * Shared game economics.
 *
 * One edge constant for every original, so the number a player is told is the
 * number the maths uses. Where rounding a payout table changes the true return
 * (Plinko), the table's *actual* RTP is computed from the rounded values and
 * surfaced — a game must never advertise 99% while paying a rounded table that
 * returns something else.
 */

/** House edge on in-house originals. 1% is a conventional figure for these. */
export const HOUSE_EDGE = 0.01;

/** Theoretical return to player before per-game rounding. */
export const BASE_RTP = 1 - HOUSE_EDGE;

/** A ceiling exists so a payout cannot exceed anything a real book could cover. */
export const MAX_MULTIPLIER = 1_000_000;

export const GAME_STAKE = {
  min: 0.1,
  max: 500,
} as const;

/** Multipliers are quoted to two decimals everywhere. */
export function floorTo2(value: number): number {
  return Math.floor(value * 100) / 100;
}

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** n choose k, iteratively — 25 choose 12 overflows a naive factorial. */
export function combinations(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let result = 1;
  for (let i = 1; i <= k; i += 1) {
    result = (result * (n - k + i)) / i;
  }
  return result;
}
