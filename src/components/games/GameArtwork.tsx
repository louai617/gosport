import {
  Bomb,
  ChevronsUp,
  Cherry,
  Coins,
  Crown,
  Dice5,
  Disc3,
  Gem,
  Grid3x3,
  Layers,
  Rocket,
  Spade,
  Sparkles,
  Triangle,
} from "lucide-react";
import { cn } from "@/lib/cn";

export interface GameArtworkProps {
  slug: string;
  hue: number;
  size?: "sm" | "md" | "lg";
  className?: string;
}

/**
 * Generated game artwork.
 *
 * Every tile is drawn from the game's own hue plus an icon — no third-party
 * thumbnails, and nothing to license. It also means a new catalogue entry
 * needs no asset pipeline: give it a hue and it has a tile.
 */
const ICONS: Record<string, typeof Dice5> = {
  dice: Dice5,
  limbo: ChevronsUp,
  crash: Rocket,
  mines: Bomb,
  plinko: Triangle,
  wheel: Disc3,
  keno: Grid3x3,
  hilo: Layers,
  roulette: Disc3,
  blackjack: Spade,
  baccarat: Crown,
  "video-poker": Spade,
  "live-roulette": Disc3,
  "live-blackjack": Spade,
  "live-baccarat": Crown,
  "game-shows": Sparkles,
  "slots-classic": Cherry,
  "slots-video": Gem,
  "slots-jackpot": Coins,
  "slots-megaways": Layers,
};

const SIZES = {
  sm: { box: "h-20", icon: 22 },
  md: { box: "h-28", icon: 30 },
  lg: { box: "h-40", icon: 44 },
} as const;

export function GameArtwork({ slug, hue, size = "md", className }: GameArtworkProps) {
  const Icon = ICONS[slug] ?? Sparkles;
  const style = SIZES[size];

  return (
    <div
      aria-hidden="true"
      className={cn(
        "relative grid w-full shrink-0 place-items-center overflow-hidden",
        style.box,
        className,
      )}
      style={{
        backgroundImage: [
          `radial-gradient(120% 150% at 18% 0%, oklch(0.52 0.16 ${hue} / 0.55) 0%, transparent 62%)`,
          `radial-gradient(90% 120% at 92% 100%, oklch(0.40 0.12 ${hue} / 0.4) 0%, transparent 58%)`,
          `linear-gradient(140deg, oklch(0.26 0.07 ${hue}), oklch(0.17 0.035 ${hue}))`,
        ].join(", "),
      }}
    >
      {/* A faint diagonal rule set keeps the tiles from reading as flat blocks. */}
      <span
        className="absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(120deg, #fff 0 1px, transparent 1px 13px)",
        }}
      />
      <Icon
        size={style.icon}
        strokeWidth={1.6}
        style={{ color: `oklch(0.92 0.05 ${hue})` }}
        className="relative drop-shadow-sm"
      />
    </div>
  );
}
