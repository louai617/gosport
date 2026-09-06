"use client";

import { useId, type ComponentPropsWithRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export type FieldSize = "sm" | "md" | "lg";

/**
 * Control chrome shared by every text-like field. Kept here — rather than in a
 * fourth file — so `Input`, `Textarea` and `Select` cannot drift apart.
 */
export const FIELD_CONTROL =
  "w-full rounded-md border border-line bg-surface-2 text-ink " +
  "placeholder:text-ink-subtle transition-colors duration-fast " +
  "hover:border-line-strong focus:border-primary " +
  "disabled:cursor-not-allowed disabled:opacity-55 " +
  "aria-[invalid=true]:border-danger aria-[invalid=true]:hover:border-danger";

export const FIELD_SIZES: Record<FieldSize, string> = {
  sm: "h-8 px-2.5 text-small",
  md: "h-[38px] px-3 text-small",
  lg: "h-11 px-3.5 text-body",
};

export function FieldLabel({
  htmlFor,
  children,
}: {
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="block text-small font-medium text-ink-muted"
    >
      {children}
    </label>
  );
}

export function FieldMessage({
  hint,
  error,
  hintId,
  errorId,
}: {
  hint?: string;
  error?: string;
  hintId: string;
  errorId: string;
}) {
  if (error) {
    return (
      <p id={errorId} role="alert" className="text-caption normal-case text-danger">
        {error}
      </p>
    );
  }
  if (hint) {
    return (
      <p id={hintId} className="text-caption normal-case text-ink-subtle">
        {hint}
      </p>
    );
  }
  return null;
}

export interface InputProps extends Omit<ComponentPropsWithRef<"input">, "size"> {
  label?: string;
  hint?: string;
  error?: string;
  iconStart?: ReactNode;
  /** Decorative trailing icon; never receives pointer events. */
  iconEnd?: ReactNode;
  /** Interactive or textual trailing adornment (a unit, a toggle button). */
  suffix?: ReactNode;
  inputSize?: FieldSize;
  /** Slot between the control and its hint/error row — used by the strength meter. */
  footer?: ReactNode;
}

export function Input({
  label,
  hint,
  error,
  iconStart,
  iconEnd,
  suffix,
  inputSize = "md",
  footer,
  id,
  className,
  ...props
}: InputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;

  return (
    <div className="space-y-1.5">
      {label ? <FieldLabel htmlFor={inputId}>{label}</FieldLabel> : null}

      <div className="relative">
        {iconStart ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 start-0 flex w-9 items-center justify-center text-ink-subtle [&_svg]:size-4"
          >
            {iconStart}
          </span>
        ) : null}

        <input
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : hint ? hintId : undefined}
          className={cn(
            FIELD_CONTROL,
            FIELD_SIZES[inputSize],
            iconStart && "ps-9",
            iconEnd && "pe-9",
            suffix && "pe-12",
            className,
          )}
          {...props}
        />

        {iconEnd && !suffix ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 end-0 flex w-9 items-center justify-center text-ink-subtle [&_svg]:size-4"
          >
            {iconEnd}
          </span>
        ) : null}

        {suffix ? (
          <span className="absolute inset-y-0 end-1 flex items-center text-small text-ink-subtle">
            {suffix}
          </span>
        ) : null}
      </div>

      {footer}

      <FieldMessage hint={hint} error={error} hintId={hintId} errorId={errorId} />
    </div>
  );
}
