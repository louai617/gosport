"use client";

import { ArrowDownRight, ArrowUpRight, Lock, X } from "lucide-react";
import type { BetSlipItem } from "@/types";
import { cn } from "@/lib/cn";
import { formatOdds } from "@/lib/format";
import { useT } from "@/i18n/I18nProvider";
import { StakeInput } from "./StakeInput";

export interface BetSlipItemRowProps {
  item: BetSlipItem;
  /** Single mode gives each line its own stake. */
  showStake: boolean;
  onRemove: (selectionId: string) => void;
  onStakeChange: (selectionId: string, stake: number) => void;
  /** Plays the add animation on the item just added. */
  isNew?: boolean;
}

export function BetSlipItemRow({
  item,
  showStake,
  onRemove,
  onStakeChange,
  isNew = false,
}: BetSlipItemRowProps) {
  const t = useT();
  const moved = item.previousOdds !== undefined && item.previousOdds !== item.odds;
  const movedUp = moved && item.odds > (item.previousOdds ?? 0);

  const marketName = t(
    item.marketNameKey,
    item.marketLine === undefined ? undefined : { line: item.marketLine },
  );

  return (
    <li
      className={cn(
        "relative rounded-lg border border-line bg-surface-2 p-3",
        item.suspended && "border-warning/30 bg-warning-soft/30",
        isNew && "animate-pop",
      )}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-small font-semibold text-ink">
            {item.selectionLabel}
          </p>
          <p className="mt-0.5 truncate text-caption normal-case tracking-normal text-ink-muted">
            {marketName}
            {item.marketLine !== undefined && !marketName.includes(String(item.marketLine))
              ? ` ${item.marketLine}`
              : ""}
          </p>
          <p className="mt-1 truncate text-caption normal-case tracking-normal text-ink-subtle">
            {item.eventLabel}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <span
            className={cn(
              "numeric rounded-sm px-1.5 py-0.5 text-small font-semibold",
              item.suspended ? "text-ink-subtle" : "text-ink",
            )}
          >
            {item.suspended ? (
              <Lock size={13} aria-label={t("live.suspended")} />
            ) : (
              formatOdds(item.odds)
            )}
          </span>

          <button
            type="button"
            onClick={() => onRemove(item.selectionId)}
            aria-label={t("betslip.removeSelection", { selection: item.selectionLabel ?? "" })}
            className="grid size-6 cursor-pointer place-items-center rounded-md text-ink-subtle transition-colors duration-fast hover:bg-surface-3 hover:text-ink"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      </div>

      {moved ? (
        <p
          className={cn(
            "mt-1.5 flex items-center gap-1 text-caption normal-case tracking-normal",
            movedUp ? "text-odds-up" : "text-odds-down",
          )}
        >
          {movedUp ? (
            <ArrowUpRight size={11} aria-hidden="true" />
          ) : (
            <ArrowDownRight size={11} aria-hidden="true" />
          )}
          {t("betslip.oddsMovedFrom", { from: formatOdds(item.previousOdds ?? 0) })}
        </p>
      ) : null}

      {showStake ? (
        <StakeInput
          size="sm"
          presets={[]}
          value={item.stake}
          onChange={(stake) => onStakeChange(item.selectionId, stake)}
          label={t("betslip.stake")}
          className="mt-3"
        />
      ) : null}
    </li>
  );
}
