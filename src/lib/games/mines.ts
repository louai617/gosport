import { BASE_RTP, combinations, floorTo2 } from "./constants";

/**
 * Mines.
 *
 * 25 tiles, `mineCount` of them bombs. After `k` safe reveals the player has
 * survived a hypergeometric draw:
 *
 *   P(k safe in a row) = C(25 − m, k) / C(25, k)
 *
 * The fair payout is its reciprocal, so the cash-out multiplier is
 * `RTP · C(25, k) / C(25 − m, k)`. Every step is priced from that identity
 * rather than from a lookup table, which is why the edge stays at 1% for any
 * mine count and any number of picks.
 */

export const TILE_COUNT = 25;
export const MIN_MINES = 1;
export const MAX_MINES = 24;

export function minesMultiplier(mineCount: number, revealed: number): number {
  if (revealed <= 0) return 1;

  const safeTiles = TILE_COUNT - mineCount;
  if (revealed > safeTiles) return 0;

  const fair =
    combinations(TILE_COUNT, revealed) / combinations(safeTiles, revealed);
  return floorTo2(BASE_RTP * fair);
}

/** The full ladder, for the "next cash-out" preview beside the grid. */
export function minesLadder(mineCount: number): number[] {
  const safeTiles = TILE_COUNT - mineCount;
  return Array.from({ length: safeTiles }, (_, index) =>
    minesMultiplier(mineCount, index + 1),
  );
}

/** Chance the *next* tile is safe, given what is already open. */
export function nextTileSafeChance(mineCount: number, revealed: number): number {
  const remaining = TILE_COUNT - revealed;
  if (remaining <= 0) return 0;
  return (remaining - mineCount) / remaining;
}

/** Bomb positions come from a shuffle, so no index can be drawn twice. */
export function minePositions(shuffled: number[], mineCount: number): Set<number> {
  return new Set(shuffled.slice(0, mineCount));
}
