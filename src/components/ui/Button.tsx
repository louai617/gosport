import type { ComponentPropsWithRef, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Spinner } from "./Spinner";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "outline"
  | "danger"
  | "success";

export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonStyleOptions {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
}

export interface ButtonProps
  extends Omit<ComponentPropsWithRef<"button">, "className">,
    ButtonStyleOptions {
  loading?: boolean;
  iconStart?: ReactNode;
  iconEnd?: ReactNode;
}

const BASE =
  "inline-flex shrink-0 cursor-pointer select-none items-center justify-center gap-2 " +
  "rounded-md font-semibold whitespace-nowrap align-middle " +
  "transition-colors duration-fast " +
  "disabled:pointer-events-none disabled:opacity-55";

const VARIANTS: Record<ButtonVariant, string> = {
  // `edge-light` is the barely-there top highlight that keeps solid fills from
  // reading flat against the dark ground.
  primary:
    "bg-primary text-ink-inverse shadow-e1 edge-light hover:bg-primary-hover active:bg-primary-active",
  secondary:
    "bg-surface-2 text-ink border border-line hover:bg-surface-3 hover:border-line-strong",
  ghost: "text-ink-muted hover:bg-surface-2 hover:text-ink",
  outline: "border border-line-strong text-ink hover:bg-surface-2",
  danger:
    "bg-danger text-ink-inverse shadow-e1 edge-light hover:brightness-110 active:brightness-95",
  success:
    "bg-success text-ink-inverse shadow-e1 edge-light hover:brightness-110 active:brightness-95",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 gap-1.5 px-3 text-small",
  md: "h-[38px] px-4 text-small",
  lg: "h-11 px-5 text-body",
};

/**
 * The button class string on its own, so an anchor or `next/link` can be
 * styled identically without pretending to be a button.
 */
export function buttonStyles({
  variant = "primary",
  size = "md",
  fullWidth = false,
  className,
}: ButtonStyleOptions = {}): string {
  return cn(BASE, VARIANTS[variant], SIZES[size], fullWidth && "w-full", className);
}

export function Button({
  variant = "primary",
  size = "md",
  fullWidth = false,
  loading = false,
  iconStart,
  iconEnd,
  className,
  children,
  disabled,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonStyles({ variant, size, fullWidth, className })}
      {...props}
    >
      {loading ? (
        <Spinner size={size === "lg" ? "md" : "sm"} />
      ) : (
        iconStart
      )}
      {children}
      {loading ? null : iconEnd}
    </button>
  );
}
