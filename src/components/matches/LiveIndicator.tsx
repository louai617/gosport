"use client";

import type { LiveState } from "@/types";
import { cn } from "@/lib/cn";
import { useT } from "@/i18n/I18nProvider";
import { StatusDot } from "@/components/ui/StatusDot";

export interface LiveIndicatorProps {
  live?: LiveState;
  /** `badge` for cards, `inline` for dense rows. */
  variant?: "badge" | "inline";
  showClock?: boolean;
  className?: string;
}

/**
 * The live cue.
 *
 * A halo pulse rather than a blinking label: the signal has to be readable
 * from across a board of forty fixtures without any single one of them
 * demanding attention. The clock is `dir="ltr"` because 67' is a number, not
 * prose, and must not reverse under Arabic.
 */
export function LiveIndicator({
  live,
  variant = "badge",
  showClock = true,
  className,
}: LiveIndicatorProps) {
  const t = useT();

  const clock =
    live?.minute !== undefined
      ? t("live.minute", { minute: live.minute }) +
        (live.addedTime ? ` ${t("live.addedTime", { minutes: live.addedTime })}` : "")
      : live
        ? t(live.periodKey)
        : "";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5",
        variant === "badge" &&
          "rounded-full border border-live/40 bg-live-soft px-2 py-0.5",
        className,
      )}
    >
      <StatusDot tone="live" pulse size="xs" />
      <span className="text-caption font-semibold uppercase text-live">
        {t("live.badge")}
      </span>
      {showClock && clock ? (
        <span dir="ltr" className="numeric text-caption font-semibold text-ink-muted">
          {clock}
        </span>
      ) : null}
    </span>
  );
}
