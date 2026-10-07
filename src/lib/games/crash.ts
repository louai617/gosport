import { floorTo2 } from "./constants";

/**
 * Crash timing — shared by the browser (to animate) and the server (to decide).
 *
 * The bust point is drawn once, up front, from the committed seed (same
 * distribution as Limbo). The rising curve is `m(t) = ⌊e^{rate·t}⌋₂`; it is
 * exponential because a linear climb makes every round feel identical, whereas
 * exponential growth makes holding harder the longer it runs.
 *
 * The server never trusts a client timestamp. It stores when the round started
 * and, on every cash-out, evaluates `multiplierAt(now − startedAt)` itself.
 */
export const GROWTH_RATE = 0.18;

export function multiplierAt(elapsedMs: number): number {
  return floorTo2(Math.exp(GROWTH_RATE * (Math.max(0, elapsedMs) / 1000)));
}

export type CrashPhase = "running" | "busted" | "cashed";

export interface CrashResolution {
  phase: CrashPhase;
  /** Multiplier the player is paid at; 0 when busted. */
  multiplier: number;
}

/**
 * What the round is at `elapsedMs`, with no player action.
 *
 * An auto cash-out target is honoured only if the curve reaches it strictly
 * before the bust point; otherwise the round busts first. Evaluating this lazily
 * (rather than with a timer) means an abandoned tab still settles correctly the
 * next time anything touches the round.
 */
export function resolveCrash(
  crashPoint: number,
  autoCashOut: number | null,
  elapsedMs: number,
): CrashResolution {
  const m = multiplierAt(elapsedMs);

  if (autoCashOut !== null && autoCashOut < crashPoint && m >= autoCashOut) {
    return { phase: "cashed", multiplier: autoCashOut };
  }
  if (m >= crashPoint) return { phase: "busted", multiplier: 0 };
  return { phase: "running", multiplier: m };
}
