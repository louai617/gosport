import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export type SpinnerSize = "xs" | "sm" | "md" | "lg";

export interface SpinnerProps extends ComponentProps<"span"> {
  size?: SpinnerSize;
  /**
   * Screen-reader text. Omit when an ancestor already conveys the busy state
   * (a button with `aria-busy`, a region with `aria-live`) — a second
   * announcement there is noise, not help.
   */
  label?: string;
}

const SIZES: Record<SpinnerSize, string> = {
  xs: "size-3.5",
  sm: "size-4",
  md: "size-5",
  lg: "size-6",
};

export function Spinner({ size = "sm", label, className, ...props }: SpinnerProps) {
  return (
    <span
      role={label ? "status" : undefined}
      className={cn("inline-flex shrink-0 items-center justify-center", className)}
      {...props}
    >
      <svg
        className={cn("animate-spin", SIZES[size])}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <circle
          cx="12"
          cy="12"
          r="9.5"
          stroke="currentColor"
          strokeWidth="2.5"
          className="opacity-25"
        />
        <path
          d="M21.5 12A9.5 9.5 0 0 0 12 2.5"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>
      {label ? <span className="sr-only">{label}</span> : null}
    </span>
  );
}
