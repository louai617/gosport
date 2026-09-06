import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { cn } from "@/lib/cn";

export type AlertTone = "info" | "success" | "warning" | "danger";

export interface AlertProps {
  tone?: AlertTone;
  title?: string;
  children?: ReactNode;
  icon?: ReactNode;
  onDismiss?: () => void;
  dismissLabel?: string;
  className?: string;
}

const TONES: Record<AlertTone, { box: string; accent: string }> = {
  info: { box: "border-info/30 bg-info-soft", accent: "text-info" },
  success: { box: "border-success/30 bg-success-soft", accent: "text-success" },
  warning: { box: "border-warning/30 bg-warning-soft", accent: "text-warning" },
  danger: { box: "border-danger/30 bg-danger-soft", accent: "text-danger" },
};

const ICONS: Record<AlertTone, typeof Info> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: XCircle,
};

export function Alert({
  tone = "info",
  title,
  children,
  icon,
  onDismiss,
  dismissLabel = "Dismiss",
  className,
}: AlertProps) {
  const Icon = ICONS[tone];
  const { box, accent } = TONES[tone];

  return (
    <div
      // Warnings and errors interrupt; informational notices should not.
      role={tone === "warning" || tone === "danger" ? "alert" : "status"}
      className={cn("flex gap-3 rounded-lg border p-3.5", box, className)}
    >
      <span aria-hidden="true" className={cn("mt-px shrink-0", accent)}>
        {icon ?? <Icon size={17} strokeWidth={2} />}
      </span>

      <div className="min-w-0 flex-1 space-y-1">
        {title ? <p className="text-small font-semibold text-ink">{title}</p> : null}
        {children ? (
          <div className="text-small leading-relaxed text-ink-muted">{children}</div>
        ) : null}
      </div>

      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={dismissLabel}
          className="-me-1 -mt-1 grid size-7 shrink-0 place-items-center rounded-md text-ink-subtle transition-colors duration-fast hover:bg-surface-2 hover:text-ink"
        >
          <X size={15} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
