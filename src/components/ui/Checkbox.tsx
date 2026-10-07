"use client";

import { useId, type ComponentPropsWithRef, type ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/cn";

export interface CheckboxProps extends Omit<ComponentPropsWithRef<"input">, "type"> {
  label: ReactNode;
  description?: ReactNode;
  error?: string;
}

export function Checkbox({
  label,
  description,
  error,
  id,
  className,
  disabled,
  ...props
}: CheckboxProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = `${inputId}-error`;
  const descriptionId = `${inputId}-description`;

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-start gap-3">
        <input
          id={inputId}
          type="checkbox"
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : description ? descriptionId : undefined}
          // Visually replaced by the box below, but kept in the a11y tree and
          // in the tab order so the native control does all the real work.
          className="peer sr-only"
          {...props}
        />

        {/* A <label> (not a span) so that clicking the box itself toggles the input. */}
        <label
          htmlFor={inputId}
          aria-hidden="true"
          className={cn(
            "mt-0.5 grid size-[18px] shrink-0 cursor-pointer place-items-center rounded-xs border",
            "transition-colors duration-fast",
            "border-line-strong bg-surface-2",
            "peer-checked:border-primary peer-checked:bg-primary peer-checked:text-ink-inverse",
            "peer-checked:[&>svg]:opacity-100",
            "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary",
            "peer-disabled:opacity-55",
            error && "border-danger",
          )}
        >
          <Check className="size-3 opacity-0 transition-opacity duration-fast" strokeWidth={3} />
        </label>

        <label
          htmlFor={inputId}
          className={cn(
            "min-w-0 select-none text-small leading-snug text-ink",
            disabled ? "cursor-not-allowed opacity-55" : "cursor-pointer",
          )}
        >
          {label}
          {description ? (
            <span id={descriptionId} className="mt-0.5 block text-caption normal-case text-ink-subtle">
              {description}
            </span>
          ) : null}
        </label>
      </div>

      {error ? (
        <p id={errorId} role="alert" className="text-caption normal-case text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
