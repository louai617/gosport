"use client";

import { cloneElement, useId, useState, type ReactElement, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface TooltipProps {
  content: ReactNode;
  side?: "top" | "bottom";
  /** A single focusable element. The tooltip attaches its handlers to it. */
  children: ReactElement<Record<string, unknown>>;
  className?: string;
}

/**
 * Hover *and* focus reveal it, Escape dismisses it, and the content is wired
 * through `aria-describedby` — a tooltip that only appears on hover is
 * invisible to keyboard users.
 */
export function Tooltip({ content, side = "top", children, className }: TooltipProps) {
  const id = useId();
  const [open, setOpen] = useState(false);

  const trigger = cloneElement(children, {
    "aria-describedby": open ? id : undefined,
    onMouseEnter: () => setOpen(true),
    onMouseLeave: () => setOpen(false),
    onFocus: () => setOpen(true),
    onBlur: () => setOpen(false),
    onKeyDown: (event: React.KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    },
  });

  return (
    <span className="relative inline-flex">
      {trigger}
      <span
        id={id}
        role="tooltip"
        hidden={!open}
        className={cn(
          "pointer-events-none absolute left-1/2 z-80 w-max max-w-56 -translate-x-1/2 rounded-md border border-line bg-surface-3 px-2 py-1 text-caption normal-case tracking-normal text-ink shadow-e3",
          side === "top" ? "bottom-[calc(100%+6px)]" : "top-[calc(100%+6px)]",
          open && "animate-fade-in",
          className,
        )}
      >
        {content}
      </span>
    </span>
  );
}
