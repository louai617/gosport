"use client";

import { useId, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label?: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  id?: string;
  className?: string;
  /** Required when no visible `label` is supplied. */
  "aria-label"?: string;
}

export function Switch({
  checked,
  onCheckedChange,
  label,
  description,
  disabled = false,
  id,
  className,
  "aria-label": ariaLabel,
}: SwitchProps) {
  const generatedId = useId();
  const switchId = id ?? generatedId;
  const labelId = `${switchId}-label`;
  const descriptionId = `${switchId}-description`;

  const control = (
    <button
      type="button"
      id={switchId}
      role="switch"
      aria-checked={checked}
      aria-label={label ? undefined : ariaLabel}
      aria-labelledby={label ? labelId : undefined}
      aria-describedby={description ? descriptionId : undefined}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border p-0.5",
        "transition-colors duration-fast",
        "disabled:cursor-not-allowed disabled:opacity-55",
        checked ? "border-primary bg-primary" : "border-line-strong bg-surface-3",
        !label && className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "size-4 rounded-full bg-ink shadow-e1",
          "transition-transform duration-base ease-out-quint",
          // The knob travels along the inline axis, so RTL must mirror it.
          checked ? "translate-x-5 rtl:-translate-x-5" : "translate-x-0",
        )}
      />
    </button>
  );

  if (!label) return control;

  return (
    <div className={cn("flex items-start justify-between gap-4", className)}>
      <div className="min-w-0 space-y-0.5">
        <label
          id={labelId}
          htmlFor={switchId}
          className={cn(
            "block text-small font-medium text-ink",
            disabled ? "cursor-not-allowed opacity-55" : "cursor-pointer",
          )}
        >
          {label}
        </label>
        {description ? (
          <p id={descriptionId} className="text-caption normal-case text-ink-subtle">
            {description}
          </p>
        ) : null}
      </div>
      {control}
    </div>
  );
}
