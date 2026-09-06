import type { ComponentPropsWithRef } from "react";
import { cn } from "@/lib/cn";

export type BadgeTone =
  | "neutral"
  | "primary"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "live";

export type BadgeSize = "sm" | "md";

export interface BadgeProps extends ComponentPropsWithRef<"span"> {
  tone?: BadgeTone;
  size?: BadgeSize;
  dot?: boolean;
}

const TONES: Record<BadgeTone, string> = {
  neutral: "bg-surface-2 text-ink-muted border-line",
  primary: "bg-primary-soft text-primary border-primary/30",
  success: "bg-success-soft text-success border-success/30",
  warning: "bg-warning-soft text-warning border-warning/30",
  danger: "bg-danger-soft text-danger border-danger/30",
  info: "bg-info-soft text-info border-info/30",
  live: "bg-live-soft text-live border-live/40",
};

const DOTS: Record<BadgeTone, string> = {
  neutral: "bg-ink-subtle",
  primary: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
  live: "bg-live",
};

const SIZES: Record<BadgeSize, string> = {
  sm: "h-5 px-1.5 gap-1",
  md: "h-6 px-2 gap-1.5",
};

export function Badge({
  tone = "neutral",
  size = "sm",
  dot = false,
  className,
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border text-caption uppercase",
        TONES[tone],
        SIZES[size],
        className,
      )}
      {...props}
    >
      {dot ? (
        <span
          aria-hidden="true"
          className={cn("size-1.5 shrink-0 rounded-full", DOTS[tone])}
        />
      ) : null}
      {children}
    </span>
  );
}
