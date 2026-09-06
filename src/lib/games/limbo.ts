import { BASE_RTP, MAX_MULTIPLIER, floorTo2 } from "./constants";

/**
 * Limbo, and the same distribution behind Crash.
 *
 * We want `P(result ≥ M) = RTP / M` for every target M — that is what makes
 * the edge identical whatever multiplier a player picks. Taking
 * `result = RTP / u` with u uniform on (0, 1] gives exactly that:
 *
 *   P(RTP/u ≥ M) = P(u ≤ RTP/M) = RTP/M
 *
 * The float arrives on [0, 1), so it is flipped to land on (0, 1]; using it
 * directly would allow a division by zero at the one input that matters most.
 */

export function multiplierFromFloat(value: number): number {
  const u = 1 - value; // (0, 1]
  const raw = BASE_RTP / u;
  // Values below 1.00 exist (u > RTP) and are a loss against any real target;
  // clamping them up keeps the displayed scale honest at 1.00×.
  return Math.min(MAX_MULTIPLIER, Math.max(1, floorTo2(raw)));
}

/** The stated chance of reaching a target, before any rounding. */
export function chanceOfReaching(target: number): number {
  return Math.min(1, BASE_RTP / Math.max(target, 1));
}

export interface LimboResult {
  result: number;
  won: boolean;
  multiplier: number;
  chance: number;
}

export function settleLimbo(value: number, target: number): LimboResult {
  const result = multiplierFromFloat(value);
  const won = result >= target;

  return {
    result,
    won,
    multiplier: won ? floorTo2(target) : 0,
    chance: chanceOfReaching(target),
  };
}
