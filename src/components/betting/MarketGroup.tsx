"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { EventDetail, MarketWithSelections } from "@/types";
import { cn } from "@/lib/cn";
import { marketLabel, outcomeShortLabel } from "@/lib/selection";
import { useT } from "@/i18n/I18nProvider";
import { Badge } from "@/components/ui/Badge";
import { OddsButton } from "./OddsButton";

export interface MarketGroupProps {
  market: MarketWithSelections;
  event: EventDetail;
  /** Collapsible with a heading, or a bare price row inside a match card. */
  variant?: "panel" | "inline";
  defaultOpen?: boolean;
  className?: string;
}

export function MarketGroup({
  market,
  event,
  variant = "panel",
  defaultOpen = true,
  className,
}: MarketGroupProps) {
  const t = useT();
  const [open, setOpen] = useState(defaultOpen);

  const prices = (
    <div
      className={cn(
        "grid gap-1.5",
        market.selections.length === 2 && "grid-cols-2",
        market.selections.length === 3 && "grid-cols-3",
        market.selections.length > 3 && "grid-cols-2 sm:grid-cols-4",
      )}
    >
      {market.selections.map((selection) => (
        <OddsButton
          key={selection.id}
          selection={selection}
          market={market}
          event={event}
          caption={outcomeShortLabel(selection, event, t)}
          variant={variant === "inline" ? "compact" : "default"}
        />
      ))}
    </div>
  );

  if (variant === "inline") return <div className={className}>{prices}</div>;

  const headingId = `market-${market.id}`;

  return (
    <section
      className={cn("overflow-hidden rounded-lg border border-line bg-surface", className)}
      aria-labelledby={headingId}
    >
      <h3>
        <button
          type="button"
          id={headingId}
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-controls={`${headingId}-panel`}
          className="flex w-full cursor-pointer items-center justify-between gap-3 px-3.5 py-3 text-start transition-colors duration-fast hover:bg-surface-2"
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-small font-semibold text-ink">
              {marketLabel(market, t)}
            </span>
            {market.status === "suspended" ? (
              <Badge tone="warning">{t("status.suspended")}</Badge>
            ) : null}
          </span>
          <ChevronDown
            size={16}
            aria-hidden="true"
            className={cn(
              "shrink-0 text-ink-subtle transition-transform duration-base",
              open && "rotate-180",
            )}
          />
        </button>
      </h3>

      <div id={`${headingId}-panel`} hidden={!open} className="px-3.5 pb-3.5">
        {prices}
      </div>
    </section>
  );
}
