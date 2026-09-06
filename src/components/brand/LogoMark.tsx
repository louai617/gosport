"use client";

import { useId } from "react";
import { cn } from "@/lib/cn";

export type LogoTone = "brand" | "mono" | "inverse";

export interface LogoMarkProps {
  /** Rendered edge length in px. The mark's box is square. */
  size?: number;
  tone?: LogoTone;
  className?: string;
  /**
   * Gives the mark an accessible name. Leave it undefined whenever a wordmark
   * or a labelled control already names it — two names on one link is worse
   * than none.
   */
  title?: string;
}

/**
 * "Ascent" — three stacked bars climbing forward. See docs/BRAND.md.
 *
 * Every dimension derives from one module: a 5-unit bar on a 32-unit field.
 * Bars are 11 long, step 4.5 across and 8.5 down, and each end slants by
 * exactly 1 unit over the bar's 5-unit height — an 11.31° forward lean applied
 * uniformly.
 *
 * The lean is baked into the coordinates instead of a `transform` on the group
 * for two reasons: the gradient below then shares the same untransformed user
 * space, and the standalone assets in /public can reuse this path data
 * verbatim rather than re-deriving it.
 */
const BARS = [
  "M17.2 5H28.2L27.2 10H16.2Z", // lead — furthest along the climb
  "M11 13.5H22L21 18.5H10Z",
  "M4.8 22H15.8L14.8 27H3.8Z",
] as const;

const FLAT_TONE_CLASS: Record<Exclude<LogoTone, "brand">, string> = {
  // Inherits, so the mark takes the colour of whatever text it sits beside.
  mono: "fill-current",
  // For placing the mark on a primary or otherwise light fill.
  inverse: "fill-ink-inverse",
};

export function LogoMark({ size = 28, tone = "brand", className, title }: LogoMarkProps) {
  // A page carries several marks (header, footer, empty states). Sharing one
  // gradient id would make every mark depend on whichever instance mounted
  // first, and unmounting that one would blank the rest. Colons are stripped
  // because `useId` emits them and they are awkward inside a `url()` fragment.
  const gradientId = `sportgo-mark-${useId().replace(/:/g, "")}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={cn("shrink-0", className)}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
    >
      {title ? <title>{title}</title> : null}
      {tone === "brand" ? (
        <defs>
          {/* Runs along the mark's axis of motion: bright at the lead bar,
              deeper at the trailing one. */}
          <linearGradient
            id={gradientId}
            x1="28.2"
            y1="5"
            x2="3.8"
            y2="27"
            gradientUnits="userSpaceOnUse"
          >
            {/* `stop-color` as an attribute cannot resolve `var()`; a style can. */}
            <stop offset="0" style={{ stopColor: "var(--color-primary)" }} />
            <stop offset="1" style={{ stopColor: "var(--color-primary-active)" }} />
          </linearGradient>
        </defs>
      ) : null}
      <g
        fill={tone === "brand" ? `url(#${gradientId})` : undefined}
        className={tone === "brand" ? undefined : FLAT_TONE_CLASS[tone]}
      >
        {BARS.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
    </svg>
  );
}
