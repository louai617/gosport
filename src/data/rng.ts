/**
 * Deterministic randomness for the demo dataset.
 *
 * The dataset is rebuilt independently on the server and in the browser for
 * the same time bucket, so every derived value — odds above all — has to come
 * out of a seeded stream. `Math.random()` would hand the two sides different
 * prices and React would flag a hydration mismatch on every match card, so it
 * is banned everywhere under `src/data`.
 */

export type Rng = () => number;

/** 2^32 — the generator's state space, used to map the state onto [0, 1). */
const UINT32_SPAN = 4294967296;

/**
 * mulberry32. 32 bits of state, no external dependency, and fast enough to
 * regenerate the whole catalogue several times inside a single render.
 */
export function seeded(seed: number): Rng {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / UINT32_SPAN;
  };
}

/**
 * FNV-1a, 32-bit. Turns an id into a stable seed so an entity keeps the same
 * derived attributes (hue, monogram colour, rating jitter) across rebuilds.
 */
export function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function pick<T>(rng: Rng, values: readonly T[]): T {
  return values[Math.floor(rng() * values.length)];
}

/** Inclusive integer range: `range(rng, 1, 6)` rolls a die. */
export function range(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

/** Continuous range, `min` inclusive, `max` exclusive. */
export function floatRange(rng: Rng, min: number, max: number): number {
  return min + rng() * (max - min);
}

export function chance(rng: Rng, probability: number): boolean {
  return rng() < probability;
}

export function shuffled<T>(rng: Rng, values: readonly T[]): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(rng() * (index + 1));
    const held = result[index];
    result[index] = result[swap];
    result[swap] = held;
  }
  return result;
}

export function sample<T>(rng: Rng, values: readonly T[], count: number): T[] {
  return shuffled(rng, values).slice(0, count);
}

export interface WeightedOption<T> {
  value: T;
  weight: number;
}

/** Weighted draw; weights need not sum to anything in particular. */
export function weighted<T>(rng: Rng, options: readonly WeightedOption<T>[]): T {
  const total = options.reduce((sum, option) => sum + option.weight, 0);
  let cursor = rng() * total;
  for (const option of options) {
    cursor -= option.weight;
    if (cursor <= 0) return option.value;
  }
  return options[options.length - 1].value;
}

const BASE36 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** Uppercase base-36 token — bet and transaction references. */
export function token(rng: Rng, length: number): string {
  let result = "";
  for (let index = 0; index < length; index += 1) {
    result += BASE36[Math.floor(rng() * BASE36.length)];
  }
  return result;
}

/** Box–Muller. Deterministic because both uniforms come from `rng`. */
export function gaussian(rng: Rng, mean = 0, deviation = 1): number {
  // Guard against log(0), which the generator can legitimately produce.
  const u1 = Math.max(rng(), Number.EPSILON);
  const u2 = rng();
  return mean + deviation * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/** Knuth's method. Only ever called with small lambdas (goals, sets). */
export function poisson(rng: Rng, lambda: number): number {
  const limit = Math.exp(-lambda);
  let count = 0;
  let product = rng();
  while (product > limit && count < 12) {
    count += 1;
    product *= rng();
  }
  return count;
}

/**
 * Two-decimal rounding, shared by the odds model and the sandbox ledger so
 * both round the same way. Real money handling would use integer minor units.
 */
export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
