import { Footprints, Hand, Shield, Shirt, Ticket, Whistle } from "lucide-react";
import type { SlotSymbol } from "@/lib/games/slots";
import { cn } from "@/lib/cn";
import { LogoMark } from "@/components/brand/LogoMark";
import { SportIcon } from "@/components/sports/SportIcon";

export interface SlotSymbolIconProps {
  symbol: SlotSymbol;
  size?: number;
  className?: string;
}

/**
 * Symbol artwork, drawn from the product's own iconography rather than the
 * usual fruit — the wild is the SportGo mark itself, which is the one symbol
 * that should be unmistakable.
 */
const TONE: Record<SlotSymbol, string> = {
  whistle: "text-ink-subtle",
  boot: "text-ink-subtle",
  glove: "text-ink-muted",
  ball: "text-info",
  jersey: "text-accent",
  crest: "text-warning",
  wild: "text-primary",
  scatter: "text-live",
};

export function SlotSymbolIcon({ symbol, size = 30, className }: SlotSymbolIconProps) {
  const shared = cn("shrink-0", TONE[symbol], className);

  switch (symbol) {
    case "whistle":
      return <Whistle size={size} className={shared} aria-hidden="true" />;
    case "boot":
      return <Footprints size={size} className={shared} aria-hidden="true" />;
    case "glove":
      return <Hand size={size} className={shared} aria-hidden="true" />;
    case "ball":
      return <SportIcon name="football" size={size} className={shared} />;
    case "jersey":
      return <Shirt size={size} className={shared} aria-hidden="true" />;
    case "crest":
      return <Shield size={size} className={shared} aria-hidden="true" />;
    case "scatter":
      return <Ticket size={size} className={shared} aria-hidden="true" />;
    case "wild":
      return <LogoMark size={size} className={cn("shrink-0", className)} />;
  }
}
