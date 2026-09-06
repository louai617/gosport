import type { EventScore } from "@/types";
import { cn } from "@/lib/cn";

export interface ScoreBoardProps {
  score?: EventScore;
  size?: "sm" | "md" | "lg";
  tone?: "live" | "final";
  className?: string;
}

const SIZES = {
  sm: "text-small",
  md: "text-h3",
  lg: "text-h1",
} as const;

/**
 * A scoreline is a number pair, not prose — `dir="ltr"` keeps 2 — 0 reading
 * left to right even inside Arabic layout, which is how scores are written in
 * Arabic sports media too.
 */
export function ScoreBoard({ score, size = "md", tone = "live", className }: ScoreBoardProps) {
  if (!score) return null;

  return (
    <div
      dir="ltr"
      className={cn(
        "numeric flex shrink-0 items-center gap-1.5 font-bold tabular-nums",
        SIZES[size],
        tone === "live" ? "text-ink" : "text-ink-muted",
        className,
      )}
    >
      <span>{score.home}</span>
      <span aria-hidden="true" className="text-ink-subtle">
        —
      </span>
      <span>{score.away}</span>
    </div>
  );
}
