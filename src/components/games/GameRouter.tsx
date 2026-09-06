"use client";

import type { GameKey } from "@/types/games";
import { CrashBoard } from "./CrashBoard";
import { DiceBoard } from "./DiceBoard";
import { LimboBoard } from "./LimboBoard";
import { MinesBoard } from "./MinesBoard";
import { PlinkoBoard } from "./PlinkoBoard";

/**
 * Maps a catalogue key to its board.
 *
 * The list of implemented keys lives in `@/lib/games/registry` so server pages
 * can check it — see the comment there for why it cannot live in this file.
 */
const BOARDS: Partial<Record<GameKey, () => React.ReactElement>> = {
  crash: CrashBoard,
  dice: DiceBoard,
  limbo: LimboBoard,
  mines: MinesBoard,
  plinko: PlinkoBoard,
};

export function GameRouter({ gameKey }: { gameKey: GameKey }) {
  const Board = BOARDS[gameKey];
  if (!Board) return null;
  return <Board />;
}
