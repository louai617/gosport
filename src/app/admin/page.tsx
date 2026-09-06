import type { Metadata } from "next";
import {
  Activity,
  CircleDot,
  Radio,
  Receipt,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { getAdminStats, getAdminTransactions } from "@/services/adminService";
import { getAdminT, getRequestLocale } from "@/i18n/server";
import { formatAmount, formatDateTime } from "@/lib/format";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { StatTile } from "@/components/account/StatTile";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/Table";

export const metadata: Metadata = { title: "Dashboard" };

export default async function AdminDashboard() {
  const [t, locale, stats, pending] = await Promise.all([
    getAdminT(),
    getRequestLocale(),
    getAdminStats(),
    getAdminTransactions({ page: 1, pageSize: 8, status: ["pending", "processing"] }),
  ]);

  const statusTone =
    stats.systemStatus === "operational"
      ? "success"
      : stats.systemStatus === "degraded"
        ? "warning"
        : "danger";

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-h1 text-ink">{t("admin.dashboard.title")}</h1>
          <p className="mt-1 text-small text-ink-muted">
            {t("admin.dashboard.description")}
          </p>
        </div>

        <Badge tone={statusTone} size="md" dot>
          {t(`admin.systemStatus.${stats.systemStatus}`)}
        </Badge>
      </header>

      <Alert tone="warning" title={t("common.demo.badge")}>
        {t("admin.dashboard.demoNotice")}
      </Alert>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatTile
          label={t("admin.stat.registeredUsers")}
          value={String(stats.registeredUsers)}
          icon={<Users size={15} />}
          hint={t("admin.stat.registeredUsersHint")}
        />
        <StatTile
          label={t("admin.stat.activeUsers")}
          value={String(stats.activeUsers24h)}
          icon={<Activity size={15} />}
          tone="primary"
          hint={t("admin.stat.activeUsersHint")}
        />
        <StatTile
          label={t("admin.stat.liveEvents")}
          value={String(stats.liveEvents)}
          icon={<Radio size={15} />}
          tone="warning"
          hint={t("admin.stat.liveEventsHint")}
        />
        <StatTile
          label={t("admin.stat.scheduledEvents")}
          value={String(stats.scheduledEvents)}
          icon={<CircleDot size={15} />}
          hint={t("admin.stat.scheduledEventsHint")}
        />
        <StatTile
          label={t("admin.stat.openBets")}
          value={String(stats.openBets)}
          icon={<Receipt size={15} />}
          hint={t("admin.stat.openBetsHint")}
        />
        <StatTile
          label={t("admin.stat.pendingTransactions")}
          value={String(stats.pendingTransactions)}
          icon={<Wallet size={15} />}
          tone={stats.pendingTransactions > 0 ? "warning" : "default"}
          hint={t("admin.stat.pendingTransactionsHint")}
        />
      </div>

      <section aria-labelledby="turnover">
        <div className="rounded-xl border border-line bg-surface p-5">
          <h2
            id="turnover"
            className="flex items-center gap-2 text-caption uppercase text-ink-subtle"
          >
            <TrendingUp size={13} aria-hidden="true" />
            {t("admin.stat.totalStake")}
          </h2>
          <p className="numeric mt-2 text-display font-bold text-ink">
            {formatAmount(stats.totalStakeSimulated, locale)}
          </p>
          <p className="mt-1.5 max-w-prose text-small text-ink-muted">
            {t("admin.stat.totalStakeHint")}
          </p>
        </div>
      </section>

      <section aria-labelledby="pending-heading">
        <h2 id="pending-heading" className="mb-3 text-h2 text-ink">
          {t("admin.dashboard.pendingTransactions")}
        </h2>

        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <Table>
            <THead>
              <tr>
                <TH>{t("wallet.column.date")}</TH>
                <TH>{t("admin.column.reference")}</TH>
                <TH>{t("wallet.column.description")}</TH>
                <TH align="end">{t("wallet.column.amount")}</TH>
                <TH align="end">{t("wallet.column.status")}</TH>
              </tr>
            </THead>
            <TBody>
              {pending.items.map((transaction) => (
                <TR key={transaction.id}>
                  <TD numeric className="whitespace-nowrap text-ink-muted">
                    {formatDateTime(transaction.createdAt, locale)}
                  </TD>
                  <TD numeric>{transaction.reference}</TD>
                  <TD>{t(transaction.descriptionKey, transaction.params)}</TD>
                  <TD align="end" numeric>
                    {formatAmount(transaction.amount, locale)}
                  </TD>
                  <TD align="end">
                    <Badge tone="info" dot>
                      {t(`wallet.status.${transaction.status}`)}
                    </Badge>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      </section>
    </div>
  );
}
