import type { Metadata } from "next";
import Link from "next/link";
import { formatAmount, formatDateTime } from "@/lib/format";
import { getAdminT, getRequestLocale } from "@/i18n/server";
import { requirePageAdmin } from "@/server/auth/pageGuard";
import { getPendingWithdrawals } from "@/services/walletAdminService";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { DecisionButtons } from "@/components/admin/QueueActions";
import { TBody, TD, TH, THead, TR, Table, TableEmpty } from "@/components/ui/Table";

export const metadata: Metadata = { title: "Withdrawals" };

/**
 * Withdrawal requests waiting for a decision. A manager sees (and decides) the
 * requests of the players they created; the superadmin sees every one.
 *
 * Approving means the player has been paid out. The held funds leave the
 * player's wallet for good and, if the player belongs to a manager, the same
 * amount returns to that manager's balance. Rejecting hands the funds back to
 * the player.
 */
export default async function AdminWithdrawalsPage() {
  const user = await requirePageAdmin("withdrawals.process");
  const [t, locale, withdrawals] = await Promise.all([getAdminT(), getRequestLocale(), getPendingWithdrawals()]);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="flex items-center gap-3 text-h1 text-ink">
          {t("admin.withdrawals.title")}
          {withdrawals.total > 0 ? <Badge tone="warning" size="md">{withdrawals.total}</Badge> : null}
        </h1>
        <p className="mt-1 text-small text-ink-muted">{t("admin.withdrawals.description")}</p>
      </header>

      <Alert tone="info">
        {t(user.role === "manager" ? "admin.withdrawals.noteManager" : "admin.withdrawals.noteSuperadmin")}
      </Alert>

      <div className="overflow-hidden rounded-xl border border-line bg-surface">
        <Table>
          <THead>
            <tr>
              <TH>{t("wallet.column.date")}</TH>
              <TH>{t("admin.column.player")}</TH>
              <TH align="end">{t("wallet.column.amount")}</TH>
              <TH align="end">{t("admin.column.decision")}</TH>
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
                  <TD align="end"><DecisionButtons id={row.id} kind="withdrawal" /></TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      </div>
    </div>
  );
}
