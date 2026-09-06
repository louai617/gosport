import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  size?: "sm" | "md";
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  size = "md",
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        size === "md" ? "gap-3 px-6 py-14" : "gap-2 px-4 py-9",
        className,
      )}
    >
      {icon ? (
        <div
          aria-hidden="true"
          className={cn(
            "grid place-items-center rounded-full border border-line-soft bg-surface-2 text-ink-subtle",
            size === "md" ? "mb-1 size-12" : "size-10",
          )}
        >
          {icon}
        </div>
      ) : null}

      <p className={cn("font-semibold text-ink", size === "md" ? "text-h3" : "text-body")}>
        {title}
      </p>

      {description ? (
        <p className="max-w-sm text-small text-ink-muted">{description}</p>
      ) : null}

      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
