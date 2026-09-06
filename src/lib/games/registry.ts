import type { GameKey } from "@/types/games";

/**
 * Which originals have a board implemented.
 *
 * Lives in `lib/`, not beside the board components: those are `"use client"`
 * modules, and a server page importing a plain function from one fails at
 * request time with "attempted to call a client function from the server".
 * That failure typechecks and builds cleanly, so the only defence is keeping
 * shared helpers out of client component files.
 */
export const IMPLEMENTED_GAMES: readonly GameKey[] = [
  "crash",
  "dice",
  "limbo",
  "mines",
  "plinko",
];

export function hasBoard(key: GameKey | undefined): key is GameKey {
  return Boolean(key && IMPLEMENTED_GAMES.includes(key));
}
