"use client";

import { useId } from "react";
import { BETTING_RULES, JURISDICTION } from "@/config/app.config";
import { cn } from "@/lib/cn";
import { useT } from "@/i18n/I18nProvider";

export interface StakeInputProps {
  value: number;
  onChange: (value: number) => void;
  label?: string;
  /** Quick-stake chips shown beneath the field. */
  presets?: number[];
  size?: "sm" | "md";
  className?: string;
}

const DEFAULT_PRESETS = [5, 10, 20, 50];

/**
 * The stake field.
 *
 * `inputMode="decimal"` rather than `type="number"`: a numeric spinner on a
 * money field invites accidental scroll-wheel edits, and mobile keyboards
 * handle `decimal` better for currency entry.
 */
export function StakeInput({
  value,
  onChange,
  label,
  presets = DEFAULT_PRESETS,
  size = "md",
  className,
}: StakeInputProps) {
  const t = useT();
  const id = useId();

  const commit = (raw: string) => {
    const parsed = Number.parseFloat(raw.replace(",", "."));
    if (Number.isNaN(parsed)) {
      onChange(0);
      return;
    }
    onChange(Math.min(BETTING_RULES.maxStake, Math.max(0, Math.round(parsed * 100) / 100)));
  };

  return (
    <div className={cn("space-y-2", className)}>
      <label htmlFor={id} className="block text-small text-ink-muted">
        {label ?? t("betslip.stake")}
      </label>

      <div className="relative flex items-center">
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          value={value === 0 ? "" : String(value)}
          placeholder="0.00"
          onChange={(event) => commit(event.target.value)}
          aria-describedby={`${id}-currency`}
          className={cn(
            "numeric w-full rounded-md border border-line bg-surface-2 pe-14 ps-3 font-semibold text-ink transition-colors duration-fast placeholder:font-normal placeholder:text-ink-subtle hover:border-line-strong focus:border-primary",
            size === "md" ? "h-11 text-h3" : "h-9 text-small",
          )}
        />
        <span
          id={`${id}-currency`}
          className="pointer-events-none absolute end-3 text-small font-medium text-ink-subtle"
        >
          {JURISDICTION.currency}
        </span>
      </div>

      {presets.length > 0 ? (
        <div className="flex gap-1.5">
          {presets.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => onChange(preset)}
              className={cn(
                "numeric h-7 flex-1 cursor-pointer rounded-md border text-caption font-semibold transition-colors duration-fast",
                value === preset
                  ? "border-primary bg-primary-soft text-primary"
                  : "border-line bg-surface-2 text-ink-muted hover:border-line-strong hover:text-ink",
              )}
            >
              +{preset}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
