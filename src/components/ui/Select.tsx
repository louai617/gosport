"use client";

import { useId, type ComponentPropsWithRef } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import { FIELD_CONTROL, FIELD_SIZES, FieldLabel, FieldMessage, type FieldSize } from "./Input";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends Omit<ComponentPropsWithRef<"select">, "size" | "children"> {
  label?: string;
  hint?: string;
  error?: string;
  options: SelectOption[];
  /** Rendered as a disabled first option so it can never be submitted. */
  placeholder?: string;
  selectSize?: FieldSize;
}

export function Select({
  label,
  hint,
  error,
  options,
  placeholder,
  selectSize = "md",
  id,
  className,
  ...props
}: SelectProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const hintId = `${selectId}-hint`;
  const errorId = `${selectId}-error`;

  return (
    <div className="space-y-1.5">
      {label ? <FieldLabel htmlFor={selectId}>{label}</FieldLabel> : null}

      <div className="relative">
        <select
          id={selectId}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : hint ? hintId : undefined}
          className={cn(
            FIELD_CONTROL,
            FIELD_SIZES[selectSize],
            "cursor-pointer appearance-none pe-9",
            className,
          )}
          {...props}
        >
          {placeholder ? (
            <option value="" disabled>
              {placeholder}
            </option>
          ) : null}
          {options.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>

        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-ink-subtle"
        />
      </div>

      <FieldMessage hint={hint} error={error} hintId={hintId} errorId={errorId} />
    </div>
  );
}
