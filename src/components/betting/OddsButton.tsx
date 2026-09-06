"use client";

import { useEffect, useRef, useState } from "react";
import { Lock, TrendingDown, TrendingUp } from "lucide-react";
import type { EventDetail, MarketWithSelections, Selection } from "@/types";
import { cn } from "@/lib/cn";
import { formatOdds } from "@/lib/format";
import { eventLabel, marketLabel, selectionLabel, toBetSlipItem } from "@/lib/selection";
import { useT } from "@/i18n/I18nProvider";
import { useBetSlipStore } from "@/store/betSlipStore";

export type OddsButtonVariant = "default" | "compact" | "hero";

export interface OddsButtonProps {
  selection: Selection;
  market: MarketWithSelections;
  event: EventDetail;
  /** Short caption above the price — "1", "X", "2", "Over". */
  caption?: string;
  variant?: OddsButtonVariant;
  className?: string;
}

const VARIANTS: Record<OddsButtonVariant, string> = {
  default: "h-12 px-2 gap-0.5",
  compact: "h-10 px-1.5 gap-0.5",
  hero: "h-15 px-3 gap-1",
};

const PRICE_SIZE: Record<OddsButtonVariant, string> = {
  default: "text-small",
  compact: "text-small",
  hero: "text-h3",
};

/**
 * The atom the whole product turns on.
 *
 * Appears in the hero, live cards, match rows and search results, and every
 * instance routes through the same store action — so "is this selected?" has
 * exactly one answer no matter which surface asked.
 *
 * Accessibility: the accessible name is the full proposition, not the number.
 * A screen-reader user hearing "1.75" learns nothing; they hear
 * "Espérance, odds 1.75, Espérance — Club Africain".
 */
export function OddsButton({
  selection,
  market,
  event,
  caption,
  variant = "default",
  className,
}: OddsButtonProps) {
  const t = useT();
  const toggle = useBetSlipStore((state) => state.toggle);
  const isSelected = useBetSlipStore((state) =>
    state.items.some((item) => item.selectionId === selection.id),
  );

  const suspended = market.status !== "open" || !selection.active;
  const label = selectionLabel(selection, market, t);

  // A price change flashes once. Comparing against the previous *rendered*
  // value rather than `selection.movement` means the animation fires on live
  // updates too, not only on the initial server payload.
  const previous = useRef(selection.odds);
  const [flash, setFlash] = useState<"up" | "down" | null>(null);

  useEffect(() => {
    if (previous.current === selection.odds) return;
    setFlash(selection.odds > previous.current ? "up" : "down");
    previous.current = selection.odds;

    const timer = window.setTimeout(() => setFlash(null), 900);
    return () => window.clearTimeout(timer);
  }, [selection.odds]);

  const accessibleName = [
    label,
    t("betslip.a11y.odds", { odds: formatOdds(selection.odds) }),
    eventLabel(event),
    marketLabel(market, t),
  ].join(", ");

  return (
    <button
      type="button"
      disabled={suspended}
      aria-pressed={isSelected}
      aria-label={accessibleName}
      onClick={() => toggle(toBetSlipItem(selection, market, event, t))}
      className={cn(
        "group relative flex min-w-0 flex-1 cursor-pointer flex-col items-center justify-center rounded-md border transition-colors duration-fast",
        VARIANTS[variant],
        isSelected
          ? "border-primary bg-primary text-ink-inverse shadow-e1"
          : "border-line bg-surface-2 text-ink hover:border-line-strong hover:bg-surface-3",
        suspended && "cursor-not-allowed border-line-soft bg-surface/60 text-ink-subtle",
        flash === "up" && !isSelected && "animate-odds-up",
        flash === "down" && !isSelected && "animate-odds-down",
        className,
      )}
    >
      {caption ? (
        <span
          aria-hidden="true"
          className={cn(
            "max-w-full truncate text-caption uppercase leading-none",
            isSelected ? "text-ink-inverse/75" : "text-ink-subtle",
          )}
        >
          {caption}
        </span>
      ) : null}

      {suspended ? (
        <Lock size={13} aria-hidden="true" className="text-ink-subtle" />
      ) : (
        <span className={cn("numeric font-semibold leading-none", PRICE_SIZE[variant])}>
          {formatOdds(selection.odds)}
        </span>
      )}

      {/* Movement marker from the feed snapshot — distinct from the flash
          above, which reflects a change that happened while watching. */}
      {!suspended && selection.movement !== "none" && !isSelected ? (
        <span
          aria-hidden="true"
          className={cn(
            "absolute end-1 top-1",
            selection.movement === "up" ? "text-odds-up" : "text-odds-down",
          )}
        >
          {selection.movement === "up" ? (
            <TrendingUp size={9} strokeWidth={2.5} />
          ) : (
            <TrendingDown size={9} strokeWidth={2.5} />
          )}
        </span>
      ) : null}
    </button>
  );
}
