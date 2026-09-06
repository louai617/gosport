import { Grid3x3, Star, Trophy } from "lucide-react";
import type { SportIconName } from "@/types";
import { cn } from "@/lib/cn";

export interface SportIconProps {
  name: SportIconName;
  size?: number;
  className?: string;
}

/**
 * Original sport icons.
 *
 * Drawn here rather than pulled from an icon set: no general-purpose library
 * carries football, handball, boxing and F1 as a coherent family, and mixing
 * approximate metaphors (a "goal" glyph standing in for football) reads as
 * careless in a navigation bar the user looks at constantly.
 *
 * One grid: 24 units, ball radius 8.5 on centre, 1.7 stroke, round joins. Each
 * sport is distinguished by its interior marking alone, so the row scans as
 * one family at 18px.
 */

const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

/** Pentagon inscribed at r=4.2 — the football's centre panel. */
const PENTAGON = "M12 7.8 L15.99 10.7 L14.47 15.4 L9.53 15.4 L8.01 10.7 Z";

const GLYPHS: Record<string, React.ReactNode> = {
  football: (
    <>
      <circle cx="12" cy="12" r="8.6" />
      <path d={PENTAGON} />
      {/* Spokes from each panel corner to the seam, as on a real ball. */}
      <path d="M12 7.8 V3.4M15.99 10.7 L20.1 9.3M14.47 15.4 L17 19.1M9.53 15.4 L7 19.1M8.01 10.7 L3.9 9.3" />
    </>
  ),

  basketball: (
    <>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M12 3.4 V20.6M3.4 12 H20.6" />
      <path d="M6.2 5.4 C9 8.4 9 15.6 6.2 18.6" />
      <path d="M17.8 5.4 C15 8.4 15 15.6 17.8 18.6" />
    </>
  ),

  // A racket, not a ball — it separates tennis from the four ball sports
  // beside it at a glance.
  tennis: (
    <>
      <ellipse cx="10.4" cy="9.6" rx="6.1" ry="6.9" />
      <path d="M14.9 14.4 L19.8 20.4" />
      <path d="M6.6 6.9 C9 11 11.5 13.5 14.6 15" opacity="0.55" />
    </>
  ),

  handball: (
    <>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M12 3.4 C14.2 8 14.2 16 12 20.6" />
      <path d="M3.9 9.2 C8.6 11 15.4 11 20.1 9.2" />
      <path d="M4.6 16 C8.8 14.4 15.2 14.4 19.4 16" />
    </>
  ),

  volleyball: (
    <>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M12 3.4 C8.2 8.2 7.4 16 9.8 20.5" />
      <path d="M20.4 9.3 C15 10.4 9.3 14.6 7.3 19.9" />
      <path d="M3.7 10.1 C8.5 12.2 14.9 12.8 20.4 11.2" />
    </>
  ),

  rugby: (
    <>
      <ellipse cx="12" cy="12" rx="9" ry="5.7" transform="rotate(-40 12 12)" />
      <path d="M8.4 15.6 L15.6 8.4" />
      <path d="M9.7 12.4 L11.6 14.3M11.9 10.2 L13.8 12.1" />
    </>
  ),

  boxing: (
    <>
      <path d="M6.7 4.9h4.6a5.4 5.4 0 0 1 5.4 5.4v1.5a2.7 2.7 0 0 1-2.7 2.7H6.5A4.6 4.6 0 0 1 1.9 9.9v-.4a4.6 4.6 0 0 1 4.6-4.6Z" />
      <path d="M6.2 14.5h9.3v2.9a1.9 1.9 0 0 1-1.9 1.9H8.1a1.9 1.9 0 0 1-1.9-1.9Z" />
      <path d="M4.4 10.4a2.2 2.2 0 0 0 0 3.3" />
    </>
  ),

  formula1: (
    <>
      <path d="M5.1 3.4V20.6" />
      <path d="M5.1 5.1h13.8v8.2H5.1Z" />
      {/* Two filled squares are enough to read as a chequered flag at 18px. */}
      <path d="M5.1 5.1h4.6v4.1H5.1ZM14.3 9.2h4.6v4.1h-4.6Z" fill="currentColor" stroke="none" />
    </>
  ),
};

export function SportIcon({ name, size = 20, className }: SportIconProps) {
  if (name === "trophy") return <Trophy size={size} className={className} aria-hidden="true" />;
  if (name === "star") return <Star size={size} className={className} aria-hidden="true" />;
  if (name === "grid") return <Grid3x3 size={size} className={className} aria-hidden="true" />;

  const glyph = GLYPHS[name];
  if (!glyph) return <Trophy size={size} className={className} aria-hidden="true" />;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={cn("shrink-0", className)}
      {...STROKE}
    >
      {glyph}
    </svg>
  );
}
