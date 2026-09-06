"use client";

import { useEffect, useState } from "react";
import { countdownParts, pad2 } from "@/lib/format";
import { cn } from "@/lib/cn";
import { useT } from "@/i18n/I18nProvider";

export interface CountdownProps {
  /** ISO-8601 kick-off time. */
  targetIso: string;
  size?: "sm" | "md" | "lg";
  className?: string;
  onExpire?: () => void;
}

const SIZES = {
  sm: { box: "h-8 min-w-8 text-small", label: "text-caption" },
  md: { box: "h-10 min-w-10 text-h3", label: "text-caption" },
  lg: { box: "h-14 min-w-14 text-h2", label: "text-caption" },
} as const;

/**
 * Counts down to kick-off.
 *
 * Starts from `null` and fills in after mount: the server and the browser are
 * never on the same millisecond, so rendering a live figure during SSR
 * guarantees a hydration mismatch on a component that appears on every page.
 */
export function Countdown({ targetIso, size = "md", className, onExpire }: CountdownProps) {
  const t = useT();
  const [parts, setParts] = useState<ReturnType<typeof countdownParts> | null>(null);

  useEffect(() => {
    const tick = () => {
      const next = countdownParts(targetIso, Date.now());
      setParts(next);
      if (next.expired) onExpire?.();
    };

    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [targetIso, onExpire]);

  const style = SIZES[size];

  if (!parts) {
    return (
      <div
        className={cn("flex gap-1.5", className)}
        aria-hidden="true"
        // Reserve the final width so the card does not reflow when it fills in.
        style={{ visibility: "hidden" }}
      >
        <span className={cn("skeleton rounded-md", style.box)} />
      </div>
    );
  }

  if (parts.expired) {
    return (
      <span className={cn("text-small font-semibold text-live", className)}>
        {t("time.now")}
      </span>
    );
  }

  const segments = [
    ...(parts.days > 0 ? [{ value: parts.days, label: t("time.days", { count: "" }).trim() }] : []),
    { value: parts.hours, label: t("time.hours", { count: "" }).trim() },
    { value: parts.minutes, label: t("time.minutes", { count: "" }).trim() },
    ...(parts.days === 0
      ? [{ value: parts.seconds, label: t("time.seconds", { count: "" }).trim() }]
      : []),
  ];

  return (
    <div
      dir="ltr"
      className={cn("flex items-start gap-1.5", className)}
      role="timer"
      aria-label={t("time.startsIn")}
    >
      {segments.map((segment, index) => (
        <div key={index} className="flex flex-col items-center gap-1">
          <span
            className={cn(
              "numeric grid place-items-center rounded-md border border-line bg-surface-2 px-1.5 font-bold text-ink tabular-nums",
              style.box,
            )}
          >
            {pad2(segment.value)}
          </span>
          <span className={cn("uppercase text-ink-subtle", style.label)}>
            {segment.label}
          </span>
        </div>
      ))}
    </div>
  );
}
