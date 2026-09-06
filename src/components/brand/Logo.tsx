"use client";

import Link from "next/link";
import { useT } from "@/i18n/I18nProvider";
import { cn } from "@/lib/cn";
import { LogoMark, type LogoTone } from "./LogoMark";

export type LogoSize = "sm" | "md" | "lg";

export interface LogoProps {
  size?: LogoSize;
  showWordmark?: boolean;
  tone?: LogoTone;
  /** When set, the lockup becomes a link — normally to the home route. */
  href?: string;
  className?: string;
}

interface LockupMetrics {
  /** Mark edge length in px. */
  mark: number;
  wordmark: string;
  gap: string;
  /**
   * The mark stands ~20% taller than the wordmark's cap height, so centring the
   * two boxes leaves it visibly floating. These few pixels of lift seat the
   * mark's lowest bar on the wordmark's baseline instead, which is where the
   * eye expects it.
   */
  lift: string;
}

const METRICS: Record<LogoSize, LockupMetrics> = {
  sm: {
    mark: 18,
    wordmark: "text-[14px] tracking-[-0.015em]",
    gap: "gap-1.5",
    lift: "-translate-y-px",
  },
  md: {
    mark: 24,
    wordmark: "text-[19px] tracking-[-0.02em]",
    gap: "gap-2",
    lift: "-translate-y-[1.5px]",
  },
  lg: {
    mark: 32,
    wordmark: "text-[25px] tracking-[-0.022em]",
    gap: "gap-2.5",
    lift: "-translate-y-[2px]",
  },
};

/**
 * "Sport" states the category, "Go" states the promise — colouring only the
 * second half marks the action without turning the word into a palette. The
 * break is on a whole syllable, never per letter, so it survives at 14px.
 */
const WORDMARK_TONE: Record<LogoTone, { sport: string; go: string }> = {
  brand: { sport: "text-ink", go: "text-primary" },
  mono: { sport: "text-current", go: "text-current" },
  inverse: { sport: "text-ink-inverse", go: "text-ink-inverse" },
};

export function Logo({
  size = "md",
  showWordmark = true,
  tone = "brand",
  href,
  className,
}: LogoProps) {
  const t = useT();
  const metrics = METRICS[size];
  const wordmark = WORDMARK_TONE[tone];
  const name = t("brand.name");

  const content = (
    <>
      <LogoMark
        size={metrics.mark}
        tone={tone}
        className={metrics.lift}
        // The link's own label covers the linked case; a bare mark with no
        // wordmark has nothing else to name it.
        title={showWordmark || href ? undefined : name}
      />
      {showWordmark ? (
        <span className={cn("font-[650] leading-none whitespace-nowrap", metrics.wordmark)}>
          <span className={wordmark.sport}>Sport</span>
          <span className={wordmark.go}>Go</span>
        </span>
      ) : null}
    </>
  );

  // The wordmark is a Latin proper noun and the mark encodes direction, so the
  // lockup keeps its LTR order under Arabic instead of mirroring — the same
  // rule scores and odds follow.
  const shell = cn("inline-flex select-none items-center", metrics.gap, className);

  if (!href) {
    return (
      <span dir="ltr" className={shell}>
        {content}
      </span>
    );
  }

  return (
    <Link
      href={href}
      dir="ltr"
      aria-label={showWordmark ? undefined : name}
      className={cn(shell, "rounded-sm transition-opacity hover:opacity-90")}
    >
      {content}
    </Link>
  );
}
