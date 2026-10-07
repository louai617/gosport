import type { SpinResult } from "@/lib/games/slots";

/**
 * Payload shapes shared by the casino API and the boards that render it.
 *
 * Kept out of `src/server/**` so a client component never has to import from a
 * `server-only` module to know what came back over the wire.
 */

/** What the player can use to audit a round once the seed pair is revealed. */
export interface RoundProof {
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
}

/** The envelope every casino endpoint returns inside `data`. */
export interface CasinoEnvelope<T> {
  /** The player's balance after this request — the only figure the client may display. */
  balance: number;
  roundId: string;
  reference: string;
  result: T;
  proof: RoundProof;
  /** False while a multi-step round (blackjack, mines, crash) is still open. */
  settled: boolean;
  stake: number;
  /** Null until settled. */
  payout: number | null;
}

export interface SlotsPlayResult {
  spin: SpinResult;
  /** Multiplier actually paid, after any free-spin doubling. */
  paidMultiplier: number;
  wasFreeSpin: boolean;
  freeSpinsRemaining: number;
}

export interface DicePlayResult {
  roll: number;
  won: boolean;
  multiplier: number;
  chance: number;
}

export interface LimboPlayResult {
  result: number;
  won: boolean;
  multiplier: number;
  chance: number;
}

/**
 * Crash view. The bust point is withheld while the round is `running` — it is
 * the one thing that must not reach the browser early — and is revealed with the
 * outcome.
 */
export interface CrashView {
  phase: "running" | "busted" | "cashed";
  /** Server clock (epoch ms) when the curve started. */
  startedAt: number;
  /** Server clock now, so the browser can correct for clock skew. */
  serverNow: number;
  autoCashOut: number | null;
  /** Present once the round has ended. */
  crashPoint: number | null;
  /** Multiplier paid; 0 when busted. Present once ended. */
  multiplier: number | null;
}

/** Mines view. The mine positions are withheld until the round ends. */
export interface MinesView {
  phase: "playing" | "busted" | "cashed" | "cleared";
  mineCount: number;
  revealed: number[];
  /** Present once the round has ended. */
  mines: number[] | null;
  exploded: number | null;
  /** Multiplier for the tiles revealed so far. */
  multiplier: number;
}
