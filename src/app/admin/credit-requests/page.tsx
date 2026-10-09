import type { Metadata } from "next";
import Link from "next/link";
import { formatAmount, formatDateTime } from "@/lib/format";
import { getAdminT, getRequestLocale } from "@/i18n/server";
import { requirePageAdmin } from "@/server/auth/pageGuard";
import { getOwnBalance } from "@/services/creditService";
import { listCreditRequests } from "@/services/creditRequestService";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { DecisionButtons } from "@/components/admin/QueueActions";
import { TBody, TD, TH, THead, TR, Table, TableEmpty } from "@/components/ui/Table";

export const metadata: Metadata = { title: "Credit requests" };

/**
 * Players asking their manager for credit. Approving sells it to them out of the
 * manager's own balance — the same guarded transaction as selling by hand, so a
 * request larger than the balance is refused rather than half-applied.
 */
export default async function AdminCreditRequestsPage() {
  const user = await requirePageAdmin("credit.distribute");
  const [t, locale, { pending, recent }, balance] = await Promise.all([
    getAdminT(),
    getRequestLocale(),
    listCreditRequests(),
    getOwnBalance(user),
  ]);

  const tone = { pending: "warning", approved: "success", rejected: "danger", cancelled: "neutral" } as const;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="flex items-center gap-3 text-h1 text-ink">
          {t("admin.creditRequests.title")}
          {pending.length > 0 ? <Badge tone="warning" size="md">{pending.length}</Badge> : null}
        </h1>
        <p className="mt-1 text-small text-ink-muted">{t("admin.creditRequests.description")}</p>
      </header>

      <Alert tone="info">{t("admin.creditRequests.note", { balance: formatAmount(balance, locale) })}</Alert>

      <div className="overflow-hidden rounded-xl border border-line bg-surface">
        <Table>
          <THead>
            <tr>
              <TH>{t("wallet.column.date")}</TH>
              <TH>{t("admin.column.player")}</TH>
              <TH align="end">{t("wallet.column.amount")}</TH>
              <TH>{t("admin.credit.note")}</TH>
              <TH align="end">{t("admin.column.decision")}</TH>
            </tr>
          </THead>
          <TBody>
            {pending.length === 0 ? (
              <TableEmpty colSpan={5} title={t("admin.creditRequests.empty")} />
            ) : (
              pending.map((row) => (
                <TR key={row.id}>
                  <TD numeric className="whitespace-nowrap text-ink-muted">{formatDateTime(row.createdAt, locale)}</TD>
                  <TD>
                    <Link href={`/admin/players/${row.counterpartId}?tab=wallet`} className="font-medium text-primary hover:underline">
                      {row.counterpart}
                    </Link>
                  </TD>
                  <TD align="end" numeric className={row.amount > balance ? "text-danger" : undefined}>
                    {formatAmount(row.amount, locale)}
                  </TD>
                  <TD className="max-w-48 truncate text-ink-muted">{row.note ?? "—"}</TD>
                  <TD align="end"><DecisionButtons id={row.id} kind="credit" /></TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      </div>

      {recent.length > 0 ? (
        <section aria-labelledby="recent" className="space-y-2">
          <h2 id="recent" className="text-h3 text-ink">{t("admin.creditRequests.recent")}</h2>
          <ul className="divide-y divide-line-soft overflow-hidden rounded-xl border border-line bg-surface">
            {recent.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-small">
                <span className="text-ink">
                  <Link href={`/admin/players/${row.counterpartId}`} className="font-medium hover:underline">{row.counterpart}</Link>
                  <span className="numeric ms-2 text-ink-muted">{formatAmount(row.amount, locale)}</span>
                </span>
                <span className="flex items-center gap-2 text-caption normal-case tracking-normal text-ink-subtle">
                  {row.decidedAt ? formatDateTime(row.decidedAt, locale) : ""}
                  <Badge tone={tone[row.status]}>{t(`wallet.creditRequest.status.${row.status}`)}</Badge>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
