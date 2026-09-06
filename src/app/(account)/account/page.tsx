import type { Metadata } from "next";
import Link from "next/link";
import { Activity, Receipt, ShieldAlert, TrendingUp } from "lucide-react";
import { getAccountOverview } from "@/services/userService";
import { getT } from "@/i18n/server";
import { formatAmount } from "@/lib/format";
import { getRequestLocale } from "@/i18n/server";
import { Alert } from "@/components/ui/Alert";
import { BalanceCard } from "@/components/account/BalanceCard";
import { StatTile } from "@/components/account/StatTile";
import { TransactionTable } from "@/components/wallet/TransactionTable";
import { BetHistoryTable } from "@/components/account/BetHistoryTable";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("account.overview.title") };
}

export default async function AccountOverviewPage() {
  const [t, locale, overview] = await Promise.all([
    getT(),
    getRequestLocale(),
    getAccountOverview(),
  ]);

  const settledCount = overview.totalBetCount - overview.openBetCount;
  const winRate =
    settledCount > 0 ? Math.round((overview.wonBetCount / settledCount) * 100) : 0;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-h1 text-ink">
          {t("account.overview.greeting", { name: overview.user.firstName })}
        </h1>
        <p className="mt-1 text-small text-ink-muted">
          {t("account.overview.description")}
        </p>
      </header>

      {/* Verification status is a fact about the account, so it is stated on
          the account, not only in the docs. */}
      <Alert tone="warning" title={t("account.kyc.title")}>
        {t("account.kyc.notStarted")}
      </Alert>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <BalanceCard wallet={overview.wallet} />

        <div className="grid grid-cols-2 gap-4">
          <StatTile
            label={t("account.stat.openBets")}
            value={String(overview.openBetCount)}
            icon={<Receipt size={15} />}
            tone="primary"
            hint={t("account.stat.openBetsHint")}
          />
          <StatTile
            label={t("account.stat.totalBets")}
            value={String(overview.totalBetCount)}
            icon={<Activity size={15} />}
            hint={t("account.stat.totalBetsHint")}
          />
          <StatTile
            label={t("account.stat.won")}
            value={String(overview.wonBetCount)}
            icon={<TrendingUp size={15} />}
            tone="success"
            hint={t("account.stat.winRate", { rate: winRate })}
          />
          <StatTile
            label={t("account.stat.reserved")}
            value={formatAmount(overview.wallet.reserved, locale)}
            icon={<ShieldAlert size={15} />}
            hint={t("account.stat.reservedHint")}
          />
        </div>
      </div>

      <section aria-labelledby="recent-bets">
        <div className="mb-3 flex items-end justify-between gap-3">
          <h2 id="recent-bets" className="text-h2 text-ink">
            {t("account.overview.recentBets")}
          </h2>
          <Link
            href="/account/bets"
            className="text-small font-semibold text-primary transition-colors duration-fast hover:text-primary-hover"
          >
            {t("ui.seeAll")}
          </Link>
        </div>

        <BetHistoryTable
          bets={{
            items: overview.recentBets,
            page: 1,
            pageSize: overview.recentBets.length || 1,
            total: overview.recentBets.length,
            totalPages: 1,
          }}
        />
      </section>

      <section aria-labelledby="recent-activity">
        <div className="mb-3 flex items-end justify-between gap-3">
          <h2 id="recent-activity" className="text-h2 text-ink">
            {t("account.overview.recentActivity")}
          </h2>
          <Link
            href="/account/transactions"
            className="text-small font-semibold text-primary transition-colors duration-fast hover:text-primary-hover"
          >
            {t("ui.seeAll")}
          </Link>
        </div>

        <TransactionTable transactions={{ items: overview.recentTransactions }} compact />
      </section>
    </div>
  );
}
