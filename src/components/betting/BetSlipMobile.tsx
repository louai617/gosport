"use client";

import { Receipt } from "lucide-react";
import { formatAmount } from "@/lib/format";
import { useHydrated } from "@/lib/useHydrated";
import { useI18n } from "@/i18n/I18nProvider";
import { useBetSlipStore } from "@/store/betSlipStore";
import { Drawer } from "@/components/ui/Drawer";
import { BetSlip } from "./BetSlip";

/**
 * Mobile surface: a floating bar that opens a bottom sheet.
 *
 * The bar only exists once something is in the slip — an empty persistent bar
 * costs thumb space and says nothing. The count lives in an `aria-live`
 * region so adding a selection is announced without moving focus away from
 * the odds button the user just pressed.
 */
export function BetSlipMobile() {
  const { t, locale } = useI18n();
  const hydrated = useHydrated();

  const items = useBetSlipStore((state) => state.items);
  const isOpen = useBetSlipStore((state) => state.isOpen);
  const setOpen = useBetSlipStore((state) => state.setOpen);

  if (!hydrated || items.length === 0) return null;

  const totalStake = items.reduce((sum, item) => sum + item.stake, 0);

  return (
    <>
      <div className="safe-bottom pointer-events-none fixed inset-x-0 bottom-0 z-50 px-4 pb-3 lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={isOpen}
          className="glass-panel pointer-events-auto flex w-full cursor-pointer items-center justify-between gap-3 rounded-xl border border-primary/40 px-4 py-3 shadow-e4 animate-slide-up"
        >
          <span className="flex items-center gap-2.5">
            <span className="relative grid size-8 place-items-center rounded-lg bg-primary text-ink-inverse">
              <Receipt size={16} aria-hidden="true" />
            </span>
            <span className="text-start">
              <span className="block text-small font-semibold text-ink">
                {t("betslip.title")}
              </span>
              <span
                aria-live="polite"
                className="numeric block text-caption normal-case tracking-normal text-ink-muted"
              >
                {t("betslip.selectionCount", { count: items.length })}
              </span>
            </span>
          </span>

          <span className="numeric text-small font-semibold text-primary">
            {formatAmount(totalStake, locale)}
          </span>
        </button>
      </div>

      <Drawer
        side="bottom"
        open={isOpen}
        onClose={() => setOpen(false)}
        title={t("betslip.title")}
        scrollBody={false}
      >
        <BetSlip showHeader={false} />
      </Drawer>
    </>
  );
}
