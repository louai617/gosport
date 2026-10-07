import type { Metadata } from "next";
import { Download } from "lucide-react";
import { flattenParams } from "@/lib/adminQueries";
import { periodQuerySchema } from "@/lib/adminValidation";
import { formatAmount, formatDateTime, formatNumber } from "@/lib/format";
import { getAdminT, getRequestLocale } from "@/i18n/server";
import { requirePageAdmin } from "@/server/auth/pageGuard";
import { can } from "@/server/auth/permissions";
import { getDashboard } from "@/services/analyticsService";
import { REPORT_KINDS } from "@/services/reportService";
import { Alert } from "@/components/ui/Alert";
import { buttonStyles } from "@/components/ui/Button";
import { PeriodFilter } from "@/components/admin/PeriodFilter";
import { TimeSeriesChart } from "@/components/admin/charts/TimeSeriesChart";
import { TBody, TD, TH, THead, TR, Table, TableEmpty } from "@/components/ui/Table";

export const metadata: Metadata = { title: "Reports" };

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AdminReportsPage({ searchParams }: PageProps) {
  const user = await requirePageAdmin("reports.read");
  const parsed = periodQuerySchema.safeParse(flattenParams(await searchParams));
  const query = parsed.success ? parsed.data : periodQuerySchema.parse({});

  const [t, locale, data] = await Promise.all([getAdminT(), getRequestLocale(), getDashboard(query)]);
  const money = (value: number) => formatAmount(value, locale, { withSymbol: false });
  const period =
    query.period === "custom"
      ? `period=custom&from=${data.period.fromDay}&to=${data.period.toDay}`
      : `period=${query.period}`;

  const rows = data.series.starts.map((start, index) => ({
    start,
    registrations: data.series.registrations[index] ?? 0,
    deposits: data.series.deposits[index] ?? 0,
    withdrawals: data.series.withdrawals[index] ?? 0,
    stakes: data.series.stakes[index] ?? 0,
    payouts: data.series.payouts[index] ?? 0,
  }));

  return (
    <div className="space-y-6">
      <header className="space-y-4">
        <div>
          <h1 className="text-h1 text-ink">{t("admin.reports.title")}</h1>
          <p className="mt-1 text-small text-ink-muted">{t("admin.reports.description")}</p>
        </div>
        <PeriodFilter basePath="/admin/reports" active={query.period} fromDay={data.period.fromDay} toDay={data.period.toDay} />
      </header>

      {data.truncated ? <Alert tone="warning">{t("admin.dashboard.truncated")}</Alert> : null}

      {can(user.role, "reports.export") ? (
        <section aria-labelledby="export" className="rounded-xl border border-line bg-surface p-4">
          <h2 id="export" className="text-h3 text-ink">{t("admin.reports.export")}</h2>
          <p className="mt-1 text-small text-ink-muted">{t("admin.reports.exportNote")}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {REPORT_KINDS.map((kind) => (
              <a
                key={kind}
                href={`/api/admin/reports/export?kind=${kind}&${period}`}
                className={buttonStyles({ variant: "secondary", size: "sm" })}
              >
                <Download size={14} aria-hidden="true" />
                {t(`admin.reports.kind.${kind}`)}
              </a>
            ))}
          </div>
        </section>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <TimeSeriesChart
          title={t("admin.chart.turnover")}
          subtitle={t("admin.chart.turnoverSub")}
          starts={data.series.starts}
          bucket={data.period.bucket}
          kind="bar"
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
          kind="bar"
          format="money"
          series={[
            { key: "deposits", label: t("admin.stat.deposits"), color: "--color-chart-1", values: data.series.deposits },
            { key: "withdrawals", label: t("admin.stat.withdrawals"), color: "--color-chart-2", values: data.series.withdrawals },
          ]}
        />
      </div>

      <section aria-labelledby="table" className="space-y-3">
        <h2 id="table" className="text-h2 text-ink">{t("admin.reports.breakdown")}</h2>
        <p className="text-caption normal-case tracking-normal text-ink-subtle">{t("admin.reports.breakdownNote")}</p>
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <Table>
            <THead>
              <tr>
                <TH>{t("admin.chart.period")}</TH>
                <TH align="end">{t("admin.stat.newPlayers")}</TH>
                <TH align="end">{t("admin.stat.deposits")}</TH>
                <TH align="end">{t("admin.stat.withdrawals")}</TH>
                <TH align="end">{t("admin.stat.bets")}</TH>
                <TH align="end">{t("admin.stat.payouts")}</TH>
                <TH align="end">{t("admin.stat.ggr")}</TH>
              </tr>
            </THead>
            <TBody>
              {rows.length === 0 ? (
                <TableEmpty colSpan={7} title={t("admin.chart.empty")} />
              ) : (
                rows.map((row) => (
                  <TR key={row.start}>
                    <TD numeric className="whitespace-nowrap text-ink-muted">
                      {formatDateTime(row.start, locale, data.period.bucket === "day" ? { hour: undefined, minute: undefined } : {})}
                    </TD>
                    <TD align="end" numeric>{formatNumber(row.registrations, locale)}</TD>
                    <TD align="end" numeric>{money(row.deposits)}</TD>
                    <TD align="end" numeric>{money(row.withdrawals)}</TD>
                    <TD align="end" numeric>{money(row.stakes)}</TD>
                    <TD align="end" numeric>{money(row.payouts)}</TD>
                    <TD align="end" numeric className="font-semibold">{money(row.stakes - row.payouts)}</TD>
                  </TR>
                ))
              )}
            </TBody>
          </Table>
        </div>
      </section>
    </div>
  );
}
