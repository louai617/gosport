"use client";

import { useRef, type CSSProperties, type ComponentPropsWithRef, type KeyboardEvent } from "react";
import { cn } from "@/lib/cn";

export interface SegmentedOption {
  value: string;
  label: string;
  badge?: string | number;
}

export type SegmentedControlSize = "sm" | "md";

export interface SegmentedControlProps
  extends Omit<ComponentPropsWithRef<"div">, "onChange"> {
  options: SegmentedOption[];
  value: string;
  onChange: (value: string) => void;
  size?: SegmentedControlSize;
  /** Accessible name for the group — required by the radiogroup pattern. */
  "aria-label": string;
}

const SIZES: Record<SegmentedControlSize, string> = {
  sm: "h-8 text-caption",
  md: "h-[38px] text-small",
};

export function SegmentedControl({
  options,
  value,
  onChange,
  size = "md",
  className,
  ...props
}: SegmentedControlProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const activeIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const keys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"];
    if (!keys.includes(event.key) || options.length === 0) return;

    const rtl = getComputedStyle(event.currentTarget).direction === "rtl";
    const forwardKey = rtl ? "ArrowLeft" : "ArrowRight";

    let next: number;
    if (event.key === "Home") {
      next = 0;
    } else if (event.key === "End") {
      next = options.length - 1;
    } else {
      const forward = event.key === forwardKey || event.key === "ArrowDown";
      next = (activeIndex + (forward ? 1 : -1) + options.length) % options.length;
    }

    event.preventDefault();
    const option = options[next];
    if (option) {
      onChange(option.value);
      trackRef.current
        ?.querySelectorAll<HTMLButtonElement>('[role="radio"]')
        [next]?.focus();
    }
  };

  return (
    <div
      ref={trackRef}
      role="radiogroup"
      onKeyDown={onKeyDown}
      className={cn(
        "relative isolate rounded-lg border border-line bg-surface-2 p-1",
        className,
      )}
      {...props}
    >
      {/* Sliding highlight: one slot wide, moved by transform so the track
          never reflows while it animates. */}
      <span
        aria-hidden="true"
        style={
          {
            width: `calc((100% - 0.5rem) / ${options.length})`,
            "--seg-index": activeIndex,
          } as CSSProperties
        }
        className={cn(
          "pointer-events-none absolute inset-y-1 start-1 -z-10 rounded-md",
          "border border-line bg-surface-3 shadow-e1",
          "transition-transform duration-base ease-out-quint",
          "translate-x-[calc(var(--seg-index)*100%)] rtl:translate-x-[calc(var(--seg-index)*-100%)]",
        )}
      />

      <div
        className="grid"
        style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      >
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(option.value)}
              className={cn(
                "inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-md px-3",
                "font-semibold whitespace-nowrap transition-colors duration-fast",
                SIZES[size],
                selected ? "text-ink" : "text-ink-muted hover:text-ink",
              )}
            >
              {option.label}
              {option.badge !== undefined ? (
                <span
                  className={cn(
                    "numeric rounded-full px-1.5 text-caption",
                    selected ? "bg-primary-soft text-primary" : "bg-surface-3 text-ink-subtle",
                  )}
                >
                  {option.badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
