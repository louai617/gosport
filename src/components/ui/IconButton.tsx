import type { ComponentPropsWithRef, ReactNode } from "react";
import { cn } from "@/lib/cn";

export type IconButtonVariant = "ghost" | "surface" | "primary";
export type IconButtonSize = "sm" | "md";

export interface IconButtonProps
  extends Omit<ComponentPropsWithRef<"button">, "children" | "aria-label"> {
  /** Accessible name; also used as the native tooltip. */
  label: string;
  icon: ReactNode;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
}

const VARIANTS: Record<IconButtonVariant, string> = {
  ghost: "text-ink-muted hover:bg-surface-2 hover:text-ink",
  surface: "bg-surface-2 text-ink border border-line hover:bg-surface-3 hover:border-line-strong",
  primary: "bg-primary text-ink-inverse edge-light hover:bg-primary-hover active:bg-primary-active",
};

const SIZES: Record<IconButtonSize, string> = {
  sm: "size-8 [&_svg]:size-4",
  md: "size-[38px] [&_svg]:size-[18px]",
};

export function IconButton({
  label,
  icon,
  variant = "ghost",
  size = "md",
  className,
  type = "button",
  ...props
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex shrink-0 cursor-pointer items-center justify-center rounded-md",
        "transition-colors duration-fast disabled:pointer-events-none disabled:opacity-55",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    >
      {icon}
    </button>
  );
}
