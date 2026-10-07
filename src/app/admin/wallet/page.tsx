import type { Metadata } from "next";
import Link from "next/link";
import { formatAmount, formatDateTime } from "@/lib/format";
import { getAdminT, getRequestLocale } from "@/i18n/server";
import { requirePageAdmin } from "@/server/auth/pageGuard";
import { can } from "@/server/auth/permissions";
import { getAdminTransactions } from "@/services/adminService";
import { listAdjustmentRequests } from "@/services/walletAdminService";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { DecisionButtons } from "@/components/admin/QueueActions";
import { TBody, TD, TH, THead, TR, Table, TableEmpty } from "@/components/ui/Table";

export const metadata: Metadata = { title: "Wallet & adjustments" };

/**
 * Where manual money work happens: withdrawals waiting for a payout decision,
 * adjustments waiting for a second administrator, and the latest manual entries.
 * Making an adjustment itself starts from the player (their Wallet tab), because
 * the amount only means something next to that player's balance.
 */
export default async function AdminWalletPage() {
  const user = await requirePageAdmin("wallet.read");
  const [t, locale] = await Promise.all([getAdminT(), getRequestLocale()]);

  const [withdrawals, requests, manual] = await Promise.all([
    getAdminTransactions({ kind: "withdrawal", status: "pending", sort: "createdAt", direction: "asc", pageSize: 50 }),
    listAdjustmentRequests("pending"),
    getAdminTransactions({ kind: ["admin_credit", "admin_debit", "adjustment", "deposit", "bonus"], pageSize: 15 }),
  ]);

  const canProcess = can(user.role, "withdrawals.process");
  const canApprove = can(user.role, "wallet.adjust.approve");

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-h1 text-ink">{t("admin.wallet.title")}</h1>
        <p className="mt-1 text-small text-ink-muted">{t("admin.wallet.description")}</p>
      </header>

      <section aria-labelledby="wd" className="space-y-3">
        <h2 id="wd" className="flex items-center gap-2 text-h2 text-ink">
          {t("admin.wallet.pendingWithdrawals")}
          {withdrawals.total > 0 ? <Badge tone="warning">{withdrawals.total}</Badge> : null}
        </h2>
        <Alert tone="info">{t("admin.wallet.withdrawalsNote")}</Alert>
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <Table>
            <THead>
              <tr>
                <TH>{t("wallet.column.date")}</TH>
                <TH>{t("admin.column.player")}</TH>
                <TH align="end">{t("wallet.column.amount")}</TH>
                <TH align="end">{canProcess ? t("admin.column.decision") : ""}</TH>
              </tr>
            </THead>
            <TBody>
              {withdrawals.items.length === 0 ? (
                <TableEmpty colSpan={4} title={t("admin.wallet.noWithdrawals")} />
              ) : (
                withdrawals.items.map((row) => (
                  <TR key={row.id}>
                    <TD numeric className="whitespace-nowrap text-ink-muted">
                      {formatDateTime(row.createdAt, locale)}
                      <span className="block text-caption text-ink-subtle">{row.reference}</span>
                    </TD>
                    <TD>
                      <Link href={`/admin/players/${row.userId}`} className="font-medium text-primary hover:underline">
                        {row.username}
                      </Link>
                    </TD>
                    <TD align="end" numeric>{formatAmount(Math.abs(row.amount), locale)}</TD>
                    <TD align="end">{canProcess ? <DecisionButtons id={row.id} kind="withdrawal" /> : null}</TD>
                  </TR>
                ))
              )}
            </TBody>
          </Table>
        </div>
      </section>

      <section aria-labelledby="ap" className="space-y-3">
        <h2 id="ap" className="flex items-center gap-2 text-h2 text-ink">
          {t("admin.wallet.pendingApprovals")}
          {requests.length > 0 ? <Badge tone="warning">{requests.length}</Badge> : null}
        </h2>
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <Table>
            <THead>
              <tr>
                <TH>{t("wallet.column.date")}</TH>
                <TH>{t("admin.column.player")}</TH>
                <TH>{t("admin.column.kind")}</TH>
                <TH align="end">{t("wallet.column.amount")}</TH>
                <TH>{t("admin.wallet.reason")}</TH>
                <TH>{t("admin.wallet.requestedBy")}</TH>
                <TH align="end">{canApprove ? t("admin.column.decision") : ""}</TH>
              </tr>
            </THead>
            <TBody>
              {requests.length === 0 ? (
                <TableEmpty colSpan={7} title={t("admin.wallet.noApprovals")} />
              ) : (
                requests.map((row) => (
                  <TR key={row.id}>
                    <TD numeric className="whitespace-nowrap text-ink-muted">{formatDateTime(row.createdAt, locale)}</TD>
                    <TD>
                      <Link href={`/admin/players/${row.userId}`} className="font-medium text-primary hover:underline">
                        {row.username}
                      </Link>
                    </TD>
                    <TD>{t(`admin.txType.${row.type}`)}</TD>
                    <TD align="end" numeric>
                      {row.amount > 0 ? "+" : ""}
                      {formatAmount(row.amount, locale)}
                    </TD>
                    <TD className="max-w-xs truncate">{row.reason}</TD>
                    <TD>{row.requestedBy}</TD>
                    <TD align="end">{canApprove ? <DecisionButtons id={row.id} kind="adjustment" /> : null}</TD>
                  </TR>
                ))
              )}
            </TBody>
          </Table>
        </div>
      </section>

      <section aria-labelledby="recent" className="space-y-3">
        <h2 id="recent" className="text-h2 text-ink">{t("admin.wallet.recentManual")}</h2>
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <Table>
            <THead>
              <tr>
                <TH>{t("wallet.column.date")}</TH>
                <TH>{t("admin.column.player")}</TH>
                <TH>{t("admin.column.kind")}</TH>
                <TH align="end">{t("wallet.column.amount")}</TH>
                <TH>{t("admin.wallet.byAdmin")}</TH>
                <TH>{t("admin.wallet.reason")}</TH>
              </tr>
            </THead>
            <TBody>
              {manual.items.length === 0 ? (
                <TableEmpty colSpan={6} title={t("empty.noTransactions")} />
              ) : (
                manual.items.map((row) => (
                  <TR key={row.id}>
                    <TD numeric className="whitespace-nowrap text-ink-muted">
                      {formatDateTime(row.createdAt, locale)}
                      <span className="block text-caption text-ink-subtle">{row.reference}</span>
                    </TD>
                    <TD>{row.username}</TD>
                    <TD>{t(`wallet.kind.${row.kind}`)}</TD>
                    <TD align="end" numeric>
                      {row.amount > 0 ? "+" : ""}
                      {formatAmount(row.amount, locale)}
                    </TD>
                    <TD>{row.createdByUsername ?? "—"}</TD>
                    <TD className="max-w-xs truncate">{row.reason ?? "—"}</TD>
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
