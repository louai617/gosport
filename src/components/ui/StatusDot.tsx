import { cn } from "@/lib/cn";

export type StatusTone =
  | "live"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "neutral"
  | "primary";

export interface StatusDotProps {
  tone?: StatusTone;
  pulse?: boolean;
  size?: "xs" | "sm" | "md";
  className?: string;
}

const TONES: Record<StatusTone, string> = {
  live: "bg-live",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
  neutral: "bg-ink-subtle",
  primary: "bg-primary",
};

const SIZES = { xs: "size-1.5", sm: "size-2", md: "size-2.5" } as const;

/**
 * The live indicator. A halo ring animates rather than the dot itself, so the
 * signal reads at a glance without the twitchiness of a blinking element.
 */
export function StatusDot({
  tone = "neutral",
  pulse = false,
  size = "sm",
  className,
}: StatusDotProps) {
  return (
    <span
      aria-hidden="true"
      className={cn("relative inline-flex shrink-0", SIZES[size], className)}
    >
      {pulse ? (
        <span
          className={cn(
            "absolute inset-0 rounded-full opacity-60 animate-live-pulse",
            TONES[tone],
          )}
        />
      ) : null}
      <span className={cn("relative inline-flex size-full rounded-full", TONES[tone])} />
    </span>
  );
}
