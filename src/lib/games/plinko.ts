import type { PlinkoRisk } from "@/types/games";
import { BASE_RTP, combinations, round2 } from "./constants";

/**
 * Plinko.
 *
 * A ball crosses `rows` pegs, going left or right at each. The bucket it lands
 * in is the number of rights, so bucket `i` has binomial probability
 * `C(rows, i) / 2^rows`.
 *
 * ── Why the payout table is computed, not copied ──────────────────────────
 * Multipliers follow a geometric shape out from the centre, `r^|i − rows/2|`,
 * where `r` sets how steep the risk profile is. The whole vector is then
 * scaled so the expected return equals the target RTP.
 *
 * Two decimals are then forced on every entry, because a player must be paid
 * the number they were shown. Rounding moves the return slightly, so the true
 * RTP is recomputed *from the rounded table* and reported. Publishing 99%
 * while paying a rounded table that returns 98.7% would be a false statement,
 * and it is the kind that survives review precisely because nobody re-derives it.
 * ──────────────────────────────────────────────────────────────────────────
 */

export const PLINKO_ROWS = [8, 12, 16] as const;

/** Ratio between the outermost and centre multiplier, per risk profile. */
const EDGE_TO_CENTRE: Record<PlinkoRisk, number> = {
  low: 18,
  medium: 190,
  high: 6_000,
};

export interface PlinkoTable {
  rows: number;
  risk: PlinkoRisk;
  /** Index 0 is the far-left bucket. Symmetric about the centre. */
  multipliers: number[];
  /** Return actually delivered by the rounded table above. */
  actualRtp: number;
}

function bucketProbabilities(rows: number): number[] {
  const total = 2 ** rows;
  return Array.from(
    { length: rows + 1 },
    (_, index) => combinations(rows, index) / total,
  );
}

export function buildPlinkoTable(rows: number, risk: PlinkoRisk): PlinkoTable {
  const probabilities = bucketProbabilities(rows);
  const centre = rows / 2;

  // r chosen so that (outermost / centre) equals the risk profile's ratio.
  const ratio = EDGE_TO_CENTRE[risk] ** (1 / centre);
  const shape = probabilities.map((_, index) => ratio ** Math.abs(index - centre));

  const expectedShape = shape.reduce(
    (sum, value, index) => sum + value * (probabilities[index] ?? 0),
    0,
  );
  const scale = BASE_RTP / expectedShape;

  const multipliers = shape.map((value) => {
    const exact = value * scale;
    // Below 1 needs two decimals to stay meaningful; above it, one is enough
    // and reads far better in a row of seventeen buckets.
    return exact < 10 ? round2(exact) : Math.round(exact * 10) / 10;
  });

  const actualRtp = multipliers.reduce(
    (sum, value, index) => sum + value * (probabilities[index] ?? 0),
    0,
  );

  return { rows, risk, multipliers, actualRtp: round2(actualRtp * 100) / 100 };
}

export interface PlinkoDrop {
  /** `false` = left, `true` = right, one per row. */
  path: boolean[];
  bucket: number;
  multiplier: number;
}

export function dropPlinko(
  floats: number[],
  rows: number,
  risk: PlinkoRisk,
): PlinkoDrop {
  const path = Array.from({ length: rows }, (_, index) => (floats[index] ?? 0) >= 0.5);
  const bucket = path.filter(Boolean).length;
  const table = buildPlinkoTable(rows, risk);

  return { path, bucket, multiplier: table.multipliers[bucket] ?? 0 };
}
