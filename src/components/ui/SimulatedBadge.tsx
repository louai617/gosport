"use client";

import { cn } from "@/lib/cn";
import { useT } from "@/i18n/I18nProvider";

export interface SimulatedBadgeProps {
  /** `inline` sits beside a figure; `block` sits under a section heading. */
  variant?: "inline" | "block";
  labelKey?: string;
  className?: string;
}

/**
 * The marker that appears wherever a simulated figure is shown — odds,
 * balances, transactions, bet returns.
 *
 * Deliberately quiet but never decorative: a reader who glances at a balance
 * must be able to tell it is not money. Do not restyle this into something
 * that can be mistaken for a badge of quality.
 */
export function SimulatedBadge({
  variant = "inline",
  labelKey = "common.demo.simulated",
  className,
}: SimulatedBadgeProps) {
  const t = useT();

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-xs border border-line-strong/70 uppercase tracking-wide text-caption text-ink-subtle",
        variant === "inline" ? "h-4 px-1" : "h-5 px-1.5",
        className,
      )}
    >
      {t(labelKey)}
    </span>
  );
}
