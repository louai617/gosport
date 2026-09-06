import type { ComponentPropsWithRef, ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface ChipProps extends ComponentPropsWithRef<"button"> {
  active?: boolean;
  icon?: ReactNode;
  count?: number;
}

export function Chip({
  active = false,
  icon,
  count,
  className,
  children,
  type = "button",
  ...props
}: ChipProps) {
  return (
    <button
      type={type}
      aria-pressed={active}
      className={cn(
        "inline-flex h-8 shrink-0 cursor-pointer items-center gap-2 rounded-full border px-3",
        "text-small font-medium whitespace-nowrap transition-colors duration-fast",
        "disabled:pointer-events-none disabled:opacity-55",
        active
          ? "border-primary/40 bg-primary-soft text-primary"
          : "border-line bg-surface-2 text-ink-muted hover:border-line-strong hover:text-ink",
        "[&_svg]:size-4 [&_svg]:shrink-0",
        className,
      )}
      {...props}
    >
      {icon}
      {children}
      {typeof count === "number" ? (
        <span
          className={cn(
            "numeric rounded-full px-1.5 text-caption",
            active ? "bg-primary/20 text-primary" : "bg-surface-3 text-ink-subtle",
          )}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}
