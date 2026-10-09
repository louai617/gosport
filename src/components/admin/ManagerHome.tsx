import Link from "next/link";
import { Coins, TrendingUp, UserPlus, Users } from "lucide-react";
import { formatAmount, formatNumber } from "@/lib/format";
import { getAdminT, getRequestLocale } from "@/i18n/server";
import { getAdminTransactions } from "@/services/adminService";
import { getManagerSummary } from "@/services/creditService";
import { StatTile } from "@/components/account/StatTile";
import { buttonStyles } from "@/components/ui/Button";
import { TransactionsList } from "@/components/wallet/TransactionsList";

/**
 * A manager's landing page: how much credit they hold, how much they have sold,
 * how many players they run — and the two things they do all day.
 */
export async function ManagerHome() {
  const [t, locale, summary, recent] = await Promise.all([
    getAdminT(),
    getRequestLocale(),
    getManagerSummary(),
    getAdminTransactions({ pageSize: 8 }),
  ]);
  const money = (value: number) => formatAmount(value, locale);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-h1 text-ink">{t("admin.manager.homeTitle")}</h1>
          <p className="mt-1 text-small text-ink-muted">{t("admin.manager.homeDescription")}</p>
        </div>
        <Link href="/admin/players/new" className={buttonStyles({ size: "lg" })}>
          <UserPlus size={16} aria-hidden="true" />
          {t("admin.players.create")}
        </Link>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          icon={<Coins size={16} aria-hidden="true" />}
          label={t("admin.credit.yourBalance")}
          value={money(summary.balance)}
          tone="primary"
          hint={t("admin.manager.balanceHint")}
        />
        <StatTile
          icon={<TrendingUp size={16} aria-hidden="true" />}
          label={t("admin.manager.soldToday")}
          value={money(summary.soldToday)}
          hint={t("admin.manager.soldLifetime", { amount: money(summary.sold) })}
        />
        <StatTile
          icon={<Users size={16} aria-hidden="true" />}
          label={t("admin.column.players")}
          value={formatNumber(summary.playerCount, locale)}
          hint={t("admin.manager.activePlayers", { count: summary.activePlayers })}
        />
        <Link href="/admin/credit-requests" className="block">
          <StatTile
            label={t("admin.creditRequests.title")}
            value={formatNumber(summary.pendingRequests, locale)}
            tone={summary.pendingRequests > 0 ? "warning" : "default"}
            hint={t("admin.manager.salesHint", { count: summary.soldCount })}
          />
        </Link>
      </div>

      <section aria-labelledby="recent" className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h2 id="recent" className="text-h3 text-ink">{t("admin.manager.recent")}</h2>
          <Link href="/admin/transactions" className="text-small font-semibold text-primary">
            {t("admin.manager.seeAll")}
          </Link>
        </div>
        <TransactionsList basePath="/admin" variant="admin" data={recent} params={{}} />
      </section>
    </div>
  );
}
