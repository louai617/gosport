"use client";

import { cn } from "@/lib/cn";
import { BetSlip } from "./BetSlip";

export interface BetSlipPanelProps {
  className?: string;
}

/**
 * Desktop surface: a sticky rail beside the board.
 *
 * ── Why this is a flex column and not just a max-height box ────────────────
 * The panel previously set `max-height` alone and relied on the slip inside
 * using `height: 100%`. A percentage height resolves against a containing
 * block with a *definite* height; a box with only `max-height` is still
 * `height: auto`, so it resolved to `auto` too. Nothing then constrained the
 * selection list, the column grew past the cap, and `overflow-hidden` silently
 * clipped the summary and the place-bet button off the bottom.
 *
 * Making the panel a flex column fixes it without a fixed height: the slip is
 * a `flex-1 min-h-0` child, so it is free to be short when the slip is nearly
 * empty and is forced to shrink — handing the overflow to its own internal
 * scroller — the moment the content would exceed the cap.
 * ──────────────────────────────────────────────────────────────────────────
 */
export function BetSlipPanel({ className }: BetSlipPanelProps) {
  return (
    <aside
      aria-label="Bet slip"
      className={cn(
        "sticky top-[calc(var(--spacing-header)+var(--spacing-sportsnav)+1rem)]",
        "flex max-h-[calc(100dvh-var(--spacing-header)-var(--spacing-sportsnav)-2rem)] flex-col",
        "overflow-hidden rounded-xl border border-line bg-surface shadow-e3 edge-light",
        className,
      )}
    >
      <BetSlip />
    </aside>
  );
}
