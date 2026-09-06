"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { useT } from "@/i18n/I18nProvider";

export interface ScrollFadeProps {
  children: ReactNode;
  className?: string;
  /** Hide the desktop arrow controls (e.g. for short chip rows). */
  showControls?: boolean;
}

const STEP = 240;

/**
 * A horizontal scroller with edge fades and — on pointer devices — arrow
 * controls that only appear when there is something to scroll to.
 *
 * `scrollLeft` is negative in RTL in every engine we target, so the arrows
 * work off the raw value and let the browser resolve direction.
 */
export function ScrollFade({ children, className, showControls = true }: ScrollFadeProps) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(true);

  const measure = useCallback(() => {
    const node = ref.current;
    if (!node) return;
    const max = node.scrollWidth - node.clientWidth;
    const offset = Math.abs(node.scrollLeft);
    setAtStart(offset <= 1);
    setAtEnd(max <= 1 || offset >= max - 1);
  }, []);

  useEffect(() => {
    measure();
    const node = ref.current;
    if (!node) return;

    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [measure]);

  const scrollBy = (direction: -1 | 1) => {
    const node = ref.current;
    if (!node) return;
    const rtl = getComputedStyle(node).direction === "rtl";
    node.scrollBy({ left: direction * STEP * (rtl ? -1 : 1), behavior: "smooth" });
  };

  const overflows = !(atStart && atEnd);

  return (
    // `min-w-0` is load-bearing: without it a grid or flex parent sizes this
    // track to the row's full width and the page scrolls sideways instead.
    <div className={cn("relative min-w-0", className)}>
      <div ref={ref} onScroll={measure} className="scroll-x mask-fade-x">
        {children}
      </div>

      {showControls && overflows ? (
        <>
          <ScrollButton
            side="start"
            hidden={atStart}
            label={t("ui.previous")}
            onClick={() => scrollBy(-1)}
          />
          <ScrollButton
            side="end"
            hidden={atEnd}
            label={t("ui.next")}
            onClick={() => scrollBy(1)}
          />
        </>
      ) : null}
    </div>
  );
}

function ScrollButton({
  side,
  hidden,
  label,
  onClick,
}: {
  side: "start" | "end";
  hidden: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      tabIndex={-1}
      className={cn(
        "absolute top-1/2 z-10 hidden size-7 -translate-y-1/2 place-items-center rounded-full border border-line bg-surface-2/90 text-ink-muted shadow-e2 backdrop-blur transition-opacity duration-base hover:text-ink md:grid",
        side === "start" ? "start-0" : "end-0",
        hidden && "pointer-events-none opacity-0",
      )}
    >
      {side === "start" ? (
        <ChevronLeft size={15} className="flip-rtl" aria-hidden="true" />
      ) : (
        <ChevronRight size={15} className="flip-rtl" aria-hidden="true" />
      )}
    </button>
  );
}
