"use client";

import Link from "next/link";
import { ArrowDownToLine, ArrowUpFromLine, Wallet as WalletIcon } from "lucide-react";
import type { Wallet } from "@/types";
import { formatAmount } from "@/lib/format";
import { useI18n } from "@/i18n/I18nProvider";
import { buttonStyles } from "@/components/ui/Button";
import { SimulatedBadge } from "@/components/ui/SimulatedBadge";
import { cn } from "@/lib/cn";

export interface BalanceCardProps {
  wallet: Wallet;
  className?: string;
}

/**
 * The balance panel.
 *
 * Every figure carries the simulated marker. A balance is the single most
 * misleading thing a demo can render, so the disclosure sits with the number
 * itself rather than only at the top of the page.
 */
export function BalanceCard({ wallet, className }: BalanceCardProps) {
  const { t, locale } = useI18n();

  return (
    <section
      aria-labelledby="balance-heading"
      className={cn(
        "gradient-hero overflow-hidden rounded-xl border border-line p-5 shadow-e2 edge-light",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2
            id="balance-heading"
            className="flex items-center gap-2 text-caption uppercase text-ink-subtle"
          >
            <WalletIcon size={13} aria-hidden="true" />
            {t("account.balance.title")}
          </h2>
          <p className="numeric mt-2 text-display font-bold text-ink">
            {formatAmount(wallet.balance, locale)}
          </p>
        </div>
        <SimulatedBadge variant="block" />
      </div>

      <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-line-soft pt-4">
        <BalanceFigure
          label={t("account.balance.withdrawable")}
          value={formatAmount(wallet.withdrawable, locale)}
        />
        <BalanceFigure
          label={t("account.balance.reserved")}
          value={formatAmount(wallet.reserved, locale)}
        />
        <BalanceFigure
          label={t("account.balance.bonus")}
          value={formatAmount(wallet.bonusBalance, locale)}
        />
      </dl>

      <div className="mt-5 flex flex-wrap gap-2">
        <Link href="/wallet/deposit" className={buttonStyles({ size: "sm" })}>
          <ArrowDownToLine size={15} aria-hidden="true" />
          {t("wallet.deposit.title")}
        </Link>
        <Link
          href="/wallet/withdraw"
          className={buttonStyles({ variant: "secondary", size: "sm" })}
        >
          <ArrowUpFromLine size={15} aria-hidden="true" />
          {t("wallet.withdraw.title")}
        </Link>
      </div>

      <p className="mt-4 text-caption normal-case leading-relaxed tracking-normal text-ink-subtle">
        {t("common.demo.balanceNote")}
      </p>
    </section>
  );
}

function BalanceFigure({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-caption normal-case tracking-normal text-ink-subtle">
        {label}
      </dt>
      <dd className="numeric mt-0.5 truncate text-small font-semibold text-ink">{value}</dd>
    </div>
  );
}
