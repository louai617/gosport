/**
 * SportGo Reels — an original 5×3 slot.
 *
 * ── Why this is built rather than imported ────────────────────────────────
 * Licensed slot content has no public API. Every aggregator (SOFTSWISS, Hub88,
 * BGaming, Slotegrator…) is a B2B onboarding: a contract, a gambling licence,
 * per-territory clearance and issued credentials. Their "demo mode" is demo
 * *inside* an onboarded integration, not open access. See docs/GAMES.md.
 * ──────────────────────────────────────────────────────────────────────────
 *
 * The maths is the real thing, not a random symbol picker:
 *
 *  • Odds come from **reel strips**, as on a physical machine. Each reel is a
 *    circular strip; a spin picks a stop position and the window shows three
 *    consecutive symbols. Drawing three independent symbols per reel would be
 *    a different (and wrong) distribution — adjacency on the strip is what
 *    makes near-misses and stacked symbols behave correctly.
 *  • The published RTP is **enumerated, not estimated**: 24⁵ = 7 962 624 stop
 *    combinations are evaluated exactly by `scripts/slot-rtp.ts`. Nothing here
 *    is a marketing number.
 *
 * This module deliberately has no imports. That lets the verification script
 * load it directly under Node's type stripping and check the *shipping* code
 * rather than a second copy of the maths — a verifier that reimplements the
 * algorithm verifies nothing.
 */

export const REEL_COUNT = 5;
export const ROW_COUNT = 3;

export type SlotSymbol =
  | "whistle"
  | "boot"
  | "glove"
  | "ball"
  | "jersey"
  | "crest"
  | "wild"
  | "scatter";

/** Wild substitutes for everything except scatter, which must land naturally. */
export const WILD: SlotSymbol = "wild";
export const SCATTER: SlotSymbol = "scatter";

/**
 * Reel strips.
 *
 * Composition *is* the game's maths. High symbols thin out toward the right so
 * a four-of-a-kind stays common enough to feel reachable while five-of-a-kind
 * remains rare; one scatter per strip puts the free-spin trigger at roughly
 * 1 in 200 spins.
 */
const S: Record<string, SlotSymbol> = {
  W: "whistle",
  B: "boot",
  G: "glove",
  L: "ball",
  J: "jersey",
  C: "crest",
  X: "wild",
  T: "scatter",
};

function strip(pattern: string): SlotSymbol[] {
  return [...pattern].map((key) => {
    const symbol = S[key];
    if (!symbol) throw new Error(`Unknown reel symbol "${key}"`);
    return symbol;
  });
}

/** 24 positions per reel — small enough to enumerate exactly, big enough to tune. */
export const REELS: SlotSymbol[][] = [
  strip("WBGLWBJCWBGLXWBJGLWCBGJT"),
  strip("BWGLJWBCGXWBLJGWBCGLXWJT"),
  strip("WBGLBWJCGXWBLGJWBCXGLWBT"),
  strip("BWLGJWBCGXWLBJGWBCXGLWJT"),
  strip("WBGLWBJWCGWBLGJWBCXGLWBT"),
];

/**
 * Ten fixed lines over the 3×5 window, as row indices per reel.
 * Straights first, then the V shapes — the order a paytable lists them.
 */
export const PAYLINES: number[][] = [
  [1, 1, 1, 1, 1],
  [0, 0, 0, 0, 0],
  [2, 2, 2, 2, 2],
  [0, 1, 2, 1, 0],
  [2, 1, 0, 1, 2],
  [0, 0, 1, 2, 2],
  [2, 2, 1, 0, 0],
  [1, 0, 1, 2, 1],
  [1, 2, 1, 0, 1],
  [0, 1, 1, 1, 0],
];

export const LINE_COUNT = PAYLINES.length;

/**
 * Payouts as a multiple of the **line** bet, for 3 / 4 / 5 of a kind.
 * Tuned against the exact enumeration until the total return landed in the
 * 96% band conventional for slots — see the header note.
 */
export const PAYTABLE: Record<SlotSymbol, [number, number, number]> = {
  // The two lowest symbols pay from four of a kind, not three. Three-of-a-kind
  // lows returned a fraction of the stake, which is the "loss disguised as a
  // win" pattern — the reels celebrate, the balance goes down. Cutting them and
  // putting the return into the higher tiers keeps the same RTP with fewer,
  // more meaningful wins.
  whistle: [0, 9, 30],
  boot: [0, 14, 45],
  glove: [4, 20, 70],
  ball: [6, 30, 120],
  jersey: [11, 45, 200],
  crest: [22, 90, 450],
  wild: [22, 90, 450],
  // Scatter pays on the total bet, not a line — see `SCATTER_PAYS`.
  scatter: [0, 0, 0],
};

/** Scatter wins multiply the whole bet and ignore paylines. */
export const SCATTER_PAYS: Record<number, number> = { 3: 2, 4: 10, 5: 50 };

/**
 * Measured, not claimed.
 *
 * Output of `node --experimental-strip-types scripts/slot-rtp.ts` over all
 * 7 962 624 stop combinations:
 *
 *   base game      73.23%
 *   free spins     23.51%   (trigger 1 in 62 spins)
 *   TOTAL          96.74%   → house edge 3.26%
 *
 *   hit frequency  30.40%
 *   of which return less than the stake: 10.07% of all spins
 *   largest single win: 97.90x the total bet
 *
 * Re-run the script after any change to the strips or the paytable; these
 * figures are shown to the player and must not drift from the maths.
 */
export const SLOT_RTP = 0.9674;
export const SLOT_HIT_FREQUENCY = 0.304;
/** Share of all spins that "win" but return less than the stake. */
export const SLOT_SUB_STAKE_WIN_RATE = 0.1007;
export const SLOT_MAX_WIN = 97.9;

export const FREE_SPINS_AWARDED = 10;
/** Every win during free spins is doubled. */
export const FREE_SPIN_MULTIPLIER = 2;

/* ========================================================================== */
/*  Spin evaluation                                                           */
/* ========================================================================== */

/** The visible window: `grid[reel][row]`. */
export type SlotGrid = SlotSymbol[][];

export function windowAt(reel: number, stop: number): SlotSymbol[] {
  const stripSymbols = REELS[reel]!;
  const length = stripSymbols.length;
  return [
    stripSymbols[stop % length]!,
    stripSymbols[(stop + 1) % length]!,
    stripSymbols[(stop + 2) % length]!,
  ];
}

export function gridFromStops(stops: number[]): SlotGrid {
  return stops.map((stop, reel) => windowAt(reel, stop));
}

export interface LineWin {
  /** Index into `PAYLINES`. */
  line: number;
  symbol: SlotSymbol;
  count: number;
  /** Multiple of the line bet. */
  multiplier: number;
}

export interface SpinResult {
  grid: SlotGrid;
  stops: number[];
  lineWins: LineWin[];
  scatterCount: number;
  /** Multiple of the *total* bet from scatters. */
  scatterMultiplier: number;
  /** Total return as a multiple of the total bet. */
  totalMultiplier: number;
  freeSpinsAwarded: number;
}

/**
 * Evaluates one line left-to-right.
 *
 * The paying symbol is the first non-wild on the line; a line of pure wilds
 * pays as wild. Wilds then substitute while counting. Leading-wild lines are
 * evaluated both ways and the better result taken — a run of wilds followed by
 * crests can be worth more as crests than as wilds, and paying the lower of
 * the two would quietly shortchange the player.
 */
function evaluateLine(grid: SlotGrid, line: number[]): LineWin | null {
  const symbols = line.map((row, reel) => grid[reel]![row]!);

  const candidates = new Set<SlotSymbol>();
  const first = symbols[0]!;
  if (first === SCATTER) return null;
  candidates.add(first === WILD ? WILD : first);

  // A leading wild could also be standing in for whatever comes next.
  if (first === WILD) {
    const next = symbols.find((s) => s !== WILD && s !== SCATTER);
    if (next) candidates.add(next);
  }

  let best: LineWin | null = null;

  for (const target of candidates) {
    let count = 0;
    for (const symbol of symbols) {
      if (symbol === target || (symbol === WILD && target !== SCATTER)) count += 1;
      else break;
    }

    if (count < 3) continue;
    const multiplier = PAYTABLE[target]![count - 3];
    if (!multiplier) continue;

    if (!best || multiplier > best.multiplier) {
      best = { line: -1, symbol: target, count, multiplier };
    }
  }

  return best;
}

export function evaluateGrid(grid: SlotGrid, stops: number[] = []): SpinResult {
  const lineWins: LineWin[] = [];

  PAYLINES.forEach((line, index) => {
    const win = evaluateLine(grid, line);
    if (win) lineWins.push({ ...win, line: index });
  });

  let scatterCount = 0;
  for (const reel of grid) {
    for (const symbol of reel) {
      if (symbol === SCATTER) scatterCount += 1;
    }
  }

  const scatterMultiplier = SCATTER_PAYS[scatterCount] ?? 0;

  // Line wins are quoted per line bet; the total bet covers all ten lines, so
  // they are divided back down to be comparable with the scatter multiplier.
  const lineMultiplier =
    lineWins.reduce((sum, win) => sum + win.multiplier, 0) / LINE_COUNT;

  return {
    grid,
    stops,
    lineWins,
    scatterCount,
    scatterMultiplier,
    totalMultiplier: lineMultiplier + scatterMultiplier,
    freeSpinsAwarded: scatterCount >= 3 ? FREE_SPINS_AWARDED : 0,
  };
}

/** Maps provably-fair floats to reel stops. One float per reel. */
export function spinFromFloats(floats: number[]): SpinResult {
  const stops = REELS.map((stripSymbols, reel) =>
    Math.floor((floats[reel] ?? 0) * stripSymbols.length) % stripSymbols.length,
  );
  return evaluateGrid(gridFromStops(stops), stops);
}
