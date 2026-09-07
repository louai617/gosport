import "server-only";
import { randomBytes } from "node:crypto";

/**
 * Server-side randomness for money-affecting outcomes.
 *
 * `crypto.randomBytes` rather than `Math.random()`: the latter is a
 * deterministic PRNG whose internal state can be recovered from a modest run
 * of outputs, which for a game that pays out is a solved-in-public problem.
 *
 * Four bytes per float, matching `src/lib/provablyFair.ts`, so a value drawn
 * here and one drawn from a committed seed have the same distribution.
 */
export function serverFloats(count: number): number[] {
  const bytes = randomBytes(count * 4);
  return Array.from({ length: count }, (_, index) => {
    const offset = index * 4;
    return (
      bytes[offset]! / 256 +
      bytes[offset + 1]! / 256 ** 2 +
      bytes[offset + 2]! / 256 ** 3 +
      bytes[offset + 3]! / 256 ** 4
    );
  });
}
