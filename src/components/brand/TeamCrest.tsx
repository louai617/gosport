import { cn } from "@/lib/cn";
import { initialsOf } from "@/lib/format";

export type CrestSize = "xs" | "sm" | "md" | "lg" | "xl";

export interface TeamCrestProps {
  /** Proper noun. Drives the monogram and, absent an explicit hue, the colour. */
  name: string;
  monogram?: string;
  /** 0-360. The data layer supplies it so a club keeps one colour everywhere. */
  hue?: number;
  size?: CrestSize;
  /** Path to a licence-cleared crest. Demo data never sets it. */
  src?: string;
  className?: string;
}

/**
 * FNV-1a folded onto the hue circle. The point is stability, not cryptography:
 * a club must land on the same colour on the server and in the browser, in this
 * session and the next, with no lookup table to keep in sync.
 *
 * Shared with `CompetitionCrest` so both placeholder families read one rule.
 */
export function hueFromName(name: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < name.length; index += 1) {
    hash ^= name.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % 360;
}

const CREST_SIZES: Record<CrestSize, { box: string; monogram: string }> = {
  xs: { box: "size-5", monogram: "text-[9px]" },
  sm: { box: "size-6", monogram: "text-[10px]" },
  md: { box: "size-8", monogram: "text-[12px]" },
  lg: { box: "size-11", monogram: "text-[15px]" },
  xl: { box: "size-16", monogram: "text-[21px]" },
};

/**
 * Square shoulders, a deeply rounded foot: enough of a shield that it never
 * reads as an avatar, without a hard point that would break up at 20px.
 */
const SHIELD_RADIUS = "24% 24% 48% 48% / 18% 18% 62% 62%";

/**
 * Both plate stops stay at or below OKLCH L 0.46 and the monogram sits at 0.96,
 * which clears 4.5:1 for every hue on the circle. Do not lighten the plate
 * without re-checking the darkest chromatic hues.
 */
function plateStyle(hue: number): React.CSSProperties {
  return {
    borderRadius: SHIELD_RADIUS,
    backgroundImage: `linear-gradient(157deg, oklch(0.46 0.13 ${hue}), oklch(0.30 0.10 ${hue}))`,
    boxShadow: `inset 0 0 0 1px oklch(0.80 0.09 ${hue} / 0.26), inset 0 1px 0 0 oklch(1 0 0 / 0.10)`,
  };
}

/**
 * The badge that stands in for a club crest. Real crests are licensed marks, so
 * the demo never ships one; `src` is the seam for the day a cleared asset
 * exists.
 *
 * Always hidden from assistive technology — the club's name is always rendered
 * as text beside it, and a monogram read aloud is noise.
 */
export function TeamCrest({
  name,
  monogram,
  hue,
  size = "md",
  src,
  className,
}: TeamCrestProps) {
  const dimensions = CREST_SIZES[size];
  const tint = hue ?? hueFromName(name);
  const label = (monogram?.trim() || initialsOf(name)).slice(0, 3).toUpperCase();

  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative inline-grid shrink-0 place-items-center overflow-hidden",
        dimensions.box,
        className,
      )}
      style={plateStyle(tint)}
    >
      {src ? (
        // Crests ship as exact-sized local assets; the image optimiser buys
        // nothing here and would reject any host that is not pre-configured.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
      ) : (
        <span
          className={cn(
            "font-[650] leading-none tracking-[0.02em] uppercase tabular-nums",
            dimensions.monogram,
          )}
          style={{ color: `oklch(0.96 0.035 ${tint})` }}
        >
          {label}
        </span>
      )}
    </span>
  );
}
