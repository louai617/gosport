import { cn } from "@/lib/cn";

export type ProgressTone = "primary" | "success" | "warning" | "danger" | "live";

export interface ProgressBarProps {
  /** 0–100. Values outside the range are clamped. */
  value: number;
  tone?: ProgressTone;
  size?: "xs" | "sm" | "md";
  label?: string;
  valueLabel?: string;
  className?: string;
}

const TONES: Record<ProgressTone, string> = {
  primary: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  live: "bg-live",
};

const SIZES = { xs: "h-1", sm: "h-1.5", md: "h-2" } as const;

export function ProgressBar({
  value,
  tone = "primary",
  size = "sm",
  label,
  valueLabel,
  className,
}: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, value));

  return (
    <div className={cn("w-full", className)}>
      {label || valueLabel ? (
        <div className="mb-1.5 flex items-baseline justify-between gap-2">
          {label ? <span className="text-small text-ink-muted">{label}</span> : null}
          {valueLabel ? (
            <span className="numeric text-small font-medium text-ink">{valueLabel}</span>
          ) : null}
        </div>
      ) : null}

      <div
        role="progressbar"
        aria-valuenow={Math.round(clamped)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
        className={cn(
          "w-full overflow-hidden rounded-full bg-surface-3",
          SIZES[size],
        )}
      >
        {/* Width rather than transform, so the fill grows from the inline-start
            edge in both writing directions without extra RTL handling. */}
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-slow ease-out-quint",
            TONES[tone],
          )}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}
