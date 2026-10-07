import type { Metadata } from "next";
import Link from "next/link";
import {
  Activity,
  ArrowDownToLine,
  ArrowUpFromLine,
  Banknote,
  Gift,
  Landmark,
  Receipt,
  Scale,
  ShieldAlert,
  TrendingUp,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import { flattenParams } from "@/lib/adminQueries";
import { periodQuerySchema } from "@/lib/adminValidation";
import { formatAmount, formatNumber } from "@/lib/format";
import { getAdminT, getRequestLocale } from "@/i18n/server";
import { getDashboard, getRecentActivity } from "@/services/analyticsService";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { StatTile } from "@/components/account/StatTile";
import { PeriodFilter } from "@/components/admin/PeriodFilter";
import { RecentActivity } from "@/components/admin/RecentActivity";
import { TimeSeriesChart } from "@/components/admin/charts/TimeSeriesChart";

export const metadata: Metadata = { title: "Dashboard" };

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AdminDashboard({ searchParams }: PageProps) {
  const parsed = periodQuerySchema.safeParse(flattenParams(await searchParams));
  const query = parsed.success ? parsed.data : periodQuerySchema.parse({});

  const [t, locale, data, activity] = await Promise.all([
    getAdminT(),
    getRequestLocale(),
    getDashboard(query),
    getRecentActivity(25),
  ]);

  const money = (value: number) => formatAmount(value, locale);
  const flow = (entries: number, players: number) =>
    t("admin.metric.flow", { count: formatNumber(entries, locale), players: formatNumber(players, locale) });

  const pendingTotal =
    data.pending.withdrawals.count + data.pending.approvals + data.pending.openTickets;

  return (
    <div className="space-y-6">
      <header className="space-y-4">
        <div>
          <h1 className="text-h1 text-ink">{t("admin.dashboard.title")}</h1>
          <p className="mt-1 text-small text-ink-muted">{t("admin.dashboard.description")}</p>
        </div>
        <PeriodFilter
          basePath="/admin"
          active={query.period}
          fromDay={data.period.fromDay}
          toDay={data.period.toDay}
        />
      </header>

      {data.truncated ? (
        <Alert tone="warning">{t("admin.dashboard.truncated")}</Alert>
      ) : null}

      {/* ----------------------------------------------------------- pending */}
      <section aria-labelledby="pending-heading">
        <h2 id="pending-heading" className="mb-3 flex items-center gap-2 text-h2 text-ink">
          <ShieldAlert size={16} aria-hidden="true" className="text-ink-subtle" />
          {t("admin.dashboard.pending")}
          {pendingTotal > 0 ? <Badge tone="warning">{pendingTotal}</Badge> : null}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <PendingLink
            href="/admin/wallet"
            label={t("admin.pending.withdrawals")}
            value={String(data.pending.withdrawals.count)}
            hint={t("admin.pending.withdrawalsHint", { amount: money(data.pending.withdrawals.amount) })}
            hot={data.pending.withdrawals.count > 0}
          />
          <PendingLink
            href="/admin/wallet"
            label={t("admin.pending.approvals")}
            value={String(data.pending.approvals)}
            hint={t("admin.pending.approvalsHint")}
            hot={data.pending.approvals > 0}
          />
          <PendingLink
            href="/admin/bets?status=pending&kind=sports"
            label={t("admin.pending.tickets")}
            value={String(data.pending.openTickets)}
            hint={t("admin.pending.ticketsHint")}
            hot={data.pending.openTickets > 0}
          />
          <PendingLink
            href="/admin/players?status=pending"
            label={t("admin.pending.invitations")}
            value={String(data.pending.invitations)}
            hint={t("admin.pending.invitationsHint")}
            hot={false}
          />
        </div>
      </section>

      {/* ----------------------------------------------------------- players */}
      <section aria-labelledby="players-heading">
        <h2 id="players-heading" className="mb-3 text-h2 text-ink">
          {t("admin.dashboard.players")}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <StatTile
            label={t("admin.stat.totalPlayers")}
            value={formatNumber(data.players.total, locale)}
            icon={<Users size={15} />}
            hint={t("admin.metric.countAllTime")}
          />
          <StatTile
            label={t("admin.stat.newPlayers")}
            value={formatNumber(data.players.registered, locale)}
            icon={<UserPlus size={15} />}
            tone="primary"
            hint={t("admin.metric.countPeriod")}
          />
          <StatTile
            label={t("admin.stat.activePlayers")}
            value={formatNumber(data.players.signedIn, locale)}
            icon={<Activity size={15} />}
            hint={t("admin.metric.uniquePlayers")}
          />
          <StatTile
            label={t("admin.stat.suspendedPlayers")}
            value={formatNumber(data.players.suspended, locale)}
            tone={data.players.suspended > 0 ? "warning" : "default"}
            hint={t("admin.metric.countNow")}
          />
          <StatTile
            label={t("admin.stat.lockedPlayers")}
            value={formatNumber(data.players.locked, locale)}
            tone={data.players.locked > 0 ? "warning" : "default"}
            hint={t("admin.metric.countNow")}
          />
        </div>
      </section>

      {/* ------------------------------------------------------------- money */}
      <section aria-labelledby="money-heading">
        <h2 id="money-heading" className="mb-3 text-h2 text-ink">
          {t("admin.dashboard.money")}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            label={t("admin.stat.balances")}
            value={money(data.balances.total)}
            icon={<Wallet size={15} />}
            hint={t("admin.metric.pointInTime")}
          />
          <StatTile
            label={t("admin.stat.deposits")}
            value={money(data.deposits.gross)}
            icon={<ArrowDownToLine size={15} />}
            hint={flow(data.deposits.count, data.deposits.players)}
          />
          <StatTile
            label={t("admin.stat.withdrawals")}
            value={money(data.withdrawals.gross)}
            icon={<ArrowUpFromLine size={15} />}
            hint={flow(data.withdrawals.count, data.withdrawals.players)}
          />
          <StatTile
            label={t("admin.stat.bets")}
            value={money(data.bets.gross)}
            icon={<Receipt size={15} />}
            hint={t("admin.metric.tickets", {
              count: formatNumber(data.bets.count, locale),
              players: formatNumber(data.bets.players, locale),
            })}
          />
          <StatTile
            label={t("admin.stat.wins")}
            value={money(data.wins.gross)}
            icon={<Banknote size={15} />}
            hint={flow(data.wins.count, data.wins.players)}
          />
          <StatTile
            label={t("admin.stat.refunds")}
            value={money(data.refunds.gross)}
            icon={<Landmark size={15} />}
            hint={flow(data.refunds.count, data.refunds.players)}
          />
          <StatTile
            label={t("admin.stat.bonuses")}
            value={money(data.bonuses.gross)}
            icon={<Gift size={15} />}
            hint={flow(data.bonuses.count, data.bonuses.players)}
          />
          <StatTile
            label={t("admin.stat.adjustments")}
            value={`${data.adjustments.net > 0 ? "+" : ""}${money(data.adjustments.net)}`}
            icon={<Scale size={15} />}
            hint={t("admin.metric.netEntries", { count: formatNumber(data.adjustments.count, locale) })}
          />
        </div>
      </section>

      {/* ----------------------------------------------------------- revenue */}
      <section aria-labelledby="revenue-heading">
        <h2 id="revenue-heading" className="mb-3 text-h2 text-ink">
          {t("admin.dashboard.revenue")}
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <StatTile
            label={t("admin.stat.ggr")}
            value={money(data.revenue.ggr)}
            icon={<TrendingUp size={15} />}
            tone={data.revenue.ggr < 0 ? "warning" : "success"}
            hint={t("admin.metric.ggrHint")}
          />
          <StatTile
            label={t("admin.stat.ngr")}
            value={money(data.revenue.ngr)}
            tone={data.revenue.ngr < 0 ? "warning" : "default"}
            hint={t("admin.metric.ngrHint")}
          />
          <StatTile
            label={t("admin.stat.rtp")}
            value={
              data.revenue.returnToPlayer === null
                ? "—"
                : `${formatNumber(data.revenue.returnToPlayer * 100, locale, 1)} %`
            }
            hint={t("admin.metric.rtpHint")}
          />
        </div>
      </section>

      {/* ------------------------------------------------------------ charts */}
      <section aria-labelledby="charts-heading" className="space-y-4">
        <h2 id="charts-heading" className="text-h2 text-ink">
          {t("admin.dashboard.charts")}
        </h2>
        <div className="grid gap-4 xl:grid-cols-2">
          <TimeSeriesChart
            title={t("admin.chart.turnover")}
            subtitle={t("admin.chart.turnoverSub")}
            starts={data.series.starts}
            bucket={data.period.bucket}
            kind="line"
            format="money"
            series={[
              { key: "stakes", label: t("admin.stat.bets"), color: "--color-chart-1", values: data.series.stakes },
              { key: "payouts", label: t("admin.stat.payouts"), color: "--color-chart-2", values: data.series.payouts },
            ]}
          />
          <TimeSeriesChart
            title={t("admin.chart.cash")}
            subtitle={t("admin.chart.cashSub")}
            starts={data.series.starts}
            bucket={data.period.bucket}
            kind="line"
            format="money"
            series={[
              { key: "deposits", label: t("admin.stat.deposits"), color: "--color-chart-1", values: data.series.deposits },
              { key: "withdrawals", label: t("admin.stat.withdrawals"), color: "--color-chart-2", values: data.series.withdrawals },
            ]}
          />
          <TimeSeriesChart
            title={t("admin.chart.registrations")}
            subtitle={t("admin.chart.registrationsSub")}
            starts={data.series.starts}
            bucket={data.period.bucket}
            kind="bar"
            format="count"
            series={[
              { key: "registrations", label: t("admin.stat.newPlayers"), color: "--color-chart-1", values: data.series.registrations },
            ]}
          />
          <RecentActivity initial={activity} />
        </div>
      </section>

      <p className="text-caption normal-case leading-relaxed tracking-normal text-ink-subtle">
        <Link href="/admin/reports" className="font-semibold text-primary underline-offset-2 hover:underline">
          {t("admin.dashboard.moreInReports")}
        </Link>
      </p>
    </div>
  );
}

function PendingLink({
  href,
  label,
  value,
  hint,
  hot,
}: {
  href: string;
  label: string;
  value: string;
  hint: string;
  hot: boolean;
}) {
  return (
    <Link href={href} className="block rounded-xl transition-transform duration-fast hover:-translate-y-0.5">
      <StatTile label={label} value={value} hint={hint} tone={hot ? "warning" : "default"} />
    </Link>
  );
}
