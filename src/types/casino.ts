import type { SpinResult } from "@/lib/games/slots";

/**
 * Payload shapes shared by the casino API and the boards that render it.
 *
 * Kept out of `src/server/**` so a client component never has to import from a
 * `server-only` module to know what came back over the wire.
 */
export interface SlotsPlayResult {
  spin: SpinResult;
  /** Multiplier actually paid, after any free-spin doubling. */
  paidMultiplier: number;
  wasFreeSpin: boolean;
  freeSpinsRemaining: number;
}
