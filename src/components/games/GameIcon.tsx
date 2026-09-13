import {
  Bomb,
  ChartNoAxesColumnIncreasing,
  Cherry,
  CircleDot,
  Dices,
  Disc3,
  Gamepad2,
  Grid3x3,
  Rocket,
  Sparkles,
  Spade,
  Triangle,
  TrendingUp,
  Tv,
  Video,
  type LucideIcon,
} from "lucide-react";
import type { GameCategory, GameKey } from "@/types/games";

/**
 * Compact glyphs for game navigation — the rail row, not the lobby tile, which
 * has its own artwork. One metaphor per game, chosen to be told apart at 16px.
 */
const GAME_ICONS: Record<GameKey, LucideIcon> = {
  slots: Cherry,
  roulette: Disc3,
  blackjack: Spade,
  crash: Rocket,
  dice: Dices,
  mines: Bomb,
  plinko: Triangle,
  limbo: TrendingUp,
  wheel: CircleDot,
  keno: Grid3x3,
  hilo: ChartNoAxesColumnIncreasing,
};

const CATEGORY_ICONS: Record<GameCategory, LucideIcon> = {
  originals: Sparkles,
  slots: Cherry,
  table_games: Spade,
  live_casino: Video,
  game_shows: Tv,
};

export interface GameIconProps {
  /** A provider title has no key and falls back to the generic controller. */
  gameKey?: GameKey;
  category?: GameCategory;
  size?: number;
  className?: string;
}

export function GameIcon({ gameKey, category, size = 16, className }: GameIconProps) {
  const Icon =
    (gameKey && GAME_ICONS[gameKey]) || (category && CATEGORY_ICONS[category]) || Gamepad2;
  return <Icon size={size} aria-hidden="true" className={className} />;
}
