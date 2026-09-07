/**
 * European roulette — single zero.
 *
 * ── ATTRIBUTION ───────────────────────────────────────────────────────────
 * The wheel order, the red-number set, the bet predicates and the payout
 * multipliers are adapted from casino-by-ai by Lemelson, MIT licensed:
 *   https://github.com/Lemelson/casino-by-ai  (src/scenes/roulette.js)
 * See THIRD_PARTY_LICENSES.md for the full licence text.
 *
 * Adapted rather than copied: the original resolves the spin in the browser
 * with `Math.random()` and mutates a localStorage wallet. Here the rules are a
 * pure module with no state and no randomness, so the *server* can resolve a
 * round and the client can render the same outcome without being able to
 * influence it.
 * ──────────────────────────────────────────────────────────────────────────
 */

export const POCKET_COUNT = 37;

/** Physical pocket order on a European wheel, clockwise from zero. */
export const WHEEL_ORDER = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24,
  16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
] as const;

export const RED_NUMBERS: ReadonlySet<number> = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);

export type PocketColour = "red" | "black" | "green";

export function colourOf(pocket: number): PocketColour {
  if (pocket === 0) return "green";
  return RED_NUMBERS.has(pocket) ? "red" : "black";
}

/**
 * Bet keys.
 *
 * `n<0-36>` is a straight-up number; the rest are the standard outside bets.
 * Strings rather than a tagged union because a bet key is also the identity of
 * a table cell and a map key on the client — one representation, no mapping.
 */
export type OutsideBet =
  | "red" | "black" | "even" | "odd" | "low" | "high"
  | "d1" | "d2" | "d3"
  | "c1" | "c2" | "c3";

export type BetKey = `n${number}` | OutsideBet;

const OUTSIDE: readonly OutsideBet[] = [
  "red", "black", "even", "odd", "low", "high",
  "d1", "d2", "d3", "c1", "c2", "c3",
];

export function isBetKey(value: string): value is BetKey {
  if (value.startsWith("n")) {
    const pocket = Number(value.slice(1));
    return Number.isInteger(pocket) && pocket >= 0 && pocket <= 36;
  }
  return (OUTSIDE as readonly string[]).includes(value);
}

export function betWins(key: BetKey, pocket: number): boolean {
  if (key.startsWith("n")) return pocket === Number(key.slice(1));

  switch (key) {
    case "red": return pocket !== 0 && RED_NUMBERS.has(pocket);
    case "black": return pocket !== 0 && !RED_NUMBERS.has(pocket);
    case "even": return pocket !== 0 && pocket % 2 === 0;
    case "odd": return pocket % 2 === 1;
    case "low": return pocket >= 1 && pocket <= 18;
    case "high": return pocket >= 19 && pocket <= 36;
    case "d1": return pocket >= 1 && pocket <= 12;
    case "d2": return pocket >= 13 && pocket <= 24;
    case "d3": return pocket >= 25 && pocket <= 36;
    // Columns are defined by residue: the third column is 3,6,9… so `% 3 === 0`.
    case "c1": return pocket !== 0 && pocket % 3 === 0;
    case "c2": return pocket !== 0 && pocket % 3 === 2;
    case "c3": return pocket !== 0 && pocket % 3 === 1;
    default: return false;
  }
}

/** Odds *to* one — a winning bet returns stake × (multiplier + 1). */
export function payoutMultiplier(key: BetKey): number {
  if (key.startsWith("n")) return 35;
  return (["d1", "d2", "d3", "c1", "c2", "c3"] as string[]).includes(key) ? 2 : 1;
}

export interface RouletteBet {
  key: BetKey;
  amount: number;
}

export interface RouletteOutcome {
  pocket: number;
  colour: PocketColour;
  /** Index into `WHEEL_ORDER`, for positioning the ball. */
  wheelIndex: number;
  winningBets: Array<{ key: BetKey; amount: number; payout: number }>;
  totalStake: number;
  /** Stake returned plus winnings. */
  totalReturn: number;
}

/**
 * The single-zero pocket is the entire house edge: 2.70% on every bet type,
 * because each pays as if there were 36 pockets while the wheel has 37.
 */
export const ROULETTE_HOUSE_EDGE = 1 / 37;

export function resolveRoulette(bets: RouletteBet[], pocket: number): RouletteOutcome {
  const winningBets: RouletteOutcome["winningBets"] = [];
  let totalStake = 0;
  let totalReturn = 0;

  for (const bet of bets) {
    totalStake += bet.amount;
    if (!betWins(bet.key, pocket)) continue;

    // Stake back plus winnings, which is how a table pays.
    const payout = bet.amount * (payoutMultiplier(bet.key) + 1);
    totalReturn += payout;
    winningBets.push({ key: bet.key, amount: bet.amount, payout });
  }

  return {
    pocket,
    colour: colourOf(pocket),
    wheelIndex: WHEEL_ORDER.indexOf(pocket as (typeof WHEEL_ORDER)[number]),
    winningBets,
    totalStake,
    totalReturn,
  };
}

/** Maps a uniform float to a pocket. The wheel is fair; the zero is the edge. */
export function pocketFromFloat(value: number): number {
  return Math.min(POCKET_COUNT - 1, Math.floor(value * POCKET_COUNT));
}
