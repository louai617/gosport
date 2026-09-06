import { cn } from "@/lib/cn";
import { initialsOf } from "@/lib/format";
import { hueFromName, type CrestSize } from "./TeamCrest";

export interface CompetitionCrestProps {
  /** Proper noun. Drives the monogram and, absent an explicit hue, the colour. */
  name: string;
  monogram?: string;
  /** 0-360. The data layer supplies it so a competition keeps one colour. */
  hue?: number;
  size?: CrestSize;
  /** Path to a licence-cleared emblem. Demo data never sets it. */
  src?: string;
  /** Unicode regional-indicator flag. Decorative, and dropped below `md`. */
  countryFlag?: string;
  className?: string;
}

const CREST_SIZES: Record<CrestSize, { box: string; monogram: string }> = {
  xs: { box: "size-5", monogram: "text-[9px]" },
  sm: { box: "size-6", monogram: "text-[10px]" },
  md: { box: "size-8", monogram: "text-[12px]" },
  lg: { box: "size-11", monogram: "text-[15px]" },
  xl: { box: "size-16", monogram: "text-[21px]" },
};

/** Below `md` the chip would be smaller than a touch target's worth of pixels. */
const FLAG_CHIP: Partial<Record<CrestSize, string>> = {
  md: "size-3.5 text-[8px]",
  lg: "size-4.5 text-[10px]",
  xl: "size-6 text-[14px]",
};

/**
 * A squircle sliced by a diagonal, against the team crest's rounded shield —
 * the two are told apart by silhouette alone, at any size, in any colour.
 *
 * The cut lands at 34% of the gradient axis so the monogram, which occupies
 * roughly 42-58%, always sits wholly on the deeper plate. Both stops stay at or
 * below OKLCH L 0.50, which clears 4.5:1 against the 0.96 monogram for every
 * hue — so the split is safe even if a longer monogram creeps over it.
 */
const CUT = "34%";

function plateStyle(hue: number): React.CSSProperties {
  return {
    borderRadius: "30%",
    backgroundImage:
      `linear-gradient(118deg, oklch(0.50 0.12 ${hue}) 0 ${CUT}, oklch(0.28 0.095 ${hue}) ${CUT} 100%)`,
    boxShadow: `inset 0 0 0 1px oklch(0.80 0.09 ${hue} / 0.26), inset 0 1px 0 0 oklch(1 0 0 / 0.10)`,
  };
}

/**
 * The emblem that stands in for a competition badge — league and cup marks are
 * licensed, so the demo never ships one. `src` is the seam for a cleared asset.
 *
 * Always hidden from assistive technology: the competition name is rendered as
 * text beside it, and the flag repeats the country already named in that text.
 */
export function CompetitionCrest({
  name,
  monogram,
  hue,
  size = "md",
  src,
  countryFlag,
  className,
}: CompetitionCrestProps) {
  const dimensions = CREST_SIZES[size];
  const tint = hue ?? hueFromName(name);
  const label = (monogram?.trim() || initialsOf(name)).slice(0, 3).toUpperCase();
  const chip = FLAG_CHIP[size];

  return (
    <span
      aria-hidden="true"
      className={cn("relative inline-flex shrink-0", dimensions.box, className)}
    >
      {/* Clipping lives on the plate, not the wrapper, so the flag chip can
          overhang the corner. */}
      <span
        className="grid size-full place-items-center overflow-hidden"
        style={plateStyle(tint)}
      >
        {src ? (
          // Emblems ship as exact-sized local assets; the image optimiser buys
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

      {countryFlag && chip ? (
        <span
          className={cn(
            "absolute -bottom-0.5 -end-0.5 grid place-items-center rounded-full",
            "bg-canvas leading-none ring-1 ring-line",
            chip,
          )}
        >
          {countryFlag}
        </span>
      ) : null}
    </span>
  );
}
