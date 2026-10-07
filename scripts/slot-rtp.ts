/**
 * Exact RTP for SportGo Reels.
 *
 * Enumerates every reel-stop combination — 24⁵ = 7 962 624 — and evaluates it
 * with the *shipping* engine, not a copy. Slot returns are usually quoted from
 * a simulation; enumeration is tractable at this strip length and gives the
 * true figure rather than one with a confidence interval.
 *
 *   node --experimental-strip-types scripts/slot-rtp.ts
 *
 * Free spins are folded in analytically: a trigger awards a fixed number of
 * spins at the same base distribution with every win doubled, so its
 * contribution is  P(trigger) × spins × baseReturn × multiplier.  Retriggers
 * during free spins are not awarded, which keeps that term exact.
 */
import {
  FREE_SPINS_AWARDED,
  FREE_SPIN_MULTIPLIER,
  REELS,
  evaluateGrid,
  type SlotSymbol,
} from "../src/lib/games/slots.ts";

const lengths = REELS.map((reel) => reel.length);
const total = lengths.reduce((product, length) => product * length, 1);

// Precompute each reel's three-symbol window per stop: the inner loop runs
// eight million times, and rebuilding windows there dominates the runtime.
const windows: SlotSymbol[][][] = REELS.map((reel) =>
  reel.map((_, stop) => [
    reel[stop % reel.length]!,
    reel[(stop + 1) % reel.length]!,
    reel[(stop + 2) % reel.length]!,
  ]),
);

let returnSum = 0;
let triggerCount = 0;
let winningSpins = 0;
let biggestWin = 0;
const bandCounts = new Map<string, number>();

const grid: SlotSymbol[][] = [[], [], [], [], []];

for (let a = 0; a < lengths[0]!; a += 1) {
  grid[0] = windows[0]![a]!;
  for (let b = 0; b < lengths[1]!; b += 1) {
    grid[1] = windows[1]![b]!;
    for (let c = 0; c < lengths[2]!; c += 1) {
      grid[2] = windows[2]![c]!;
      for (let d = 0; d < lengths[3]!; d += 1) {
        grid[3] = windows[3]![d]!;
        for (let e = 0; e < lengths[4]!; e += 1) {
          grid[4] = windows[4]![e]!;

          const result = evaluateGrid(grid);
          const value = result.totalMultiplier;

          returnSum += value;
          if (value > 0) winningSpins += 1;
          if (value > biggestWin) biggestWin = value;
          if (result.freeSpinsAwarded > 0) triggerCount += 1;

          const band =
            value === 0 ? "0" : value < 1 ? "<1x" : value < 5 ? "1-5x" : value < 20 ? "5-20x" : "20x+";
          bandCounts.set(band, (bandCounts.get(band) ?? 0) + 1);
        }
      }
    }
  }
}

const baseRtp = returnSum / total;
const triggerRate = triggerCount / total;
const freeSpinRtp = triggerRate * FREE_SPINS_AWARDED * baseRtp * FREE_SPIN_MULTIPLIER;
const totalRtp = baseRtp + freeSpinRtp;

const pct = (value: number) => `${(value * 100).toFixed(2)}%`;

console.log(`\nSportGo Reels — exact enumeration over ${total.toLocaleString("en-US")} stops\n`);
console.log(`  base game RTP      ${pct(baseRtp)}`);
console.log(`  free-spin RTP      ${pct(freeSpinRtp)}   (trigger 1 in ${Math.round(1 / triggerRate)} spins)`);
console.log(`  ────────────────────────────`);
console.log(`  TOTAL RTP          ${pct(totalRtp)}`);
console.log(`  house edge         ${pct(1 - totalRtp)}\n`);
console.log(`  hit frequency      ${pct(winningSpins / total)}`);
console.log(`  largest single win ${biggestWin.toFixed(2)}x total bet\n`);

console.log("  win distribution");
for (const band of ["0", "<1x", "1-5x", "5-20x", "20x+"]) {
  const count = bandCounts.get(band) ?? 0;
  console.log(`    ${band.padEnd(6)} ${pct(count / total).padStart(7)}`);
}
console.log();
