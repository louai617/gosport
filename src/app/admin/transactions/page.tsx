import type { Metadata } from "next";
import type { TransactionKind, TransactionStatus } from "@/types";
import { getAdminTransactions } from "@/services/adminService";
import { getAdminT, getRequestLocale } from "@/i18n/server";
import { formatAmount, formatDateTime } from "@/lib/format";
import { AdminTableClient, type AdminRow } from "@/components/admin/AdminTableClient";
import { parseListQuery } from "@/lib/listQuery";
import type { BadgeTone } from "@/components/ui/Badge";

export const metadata: Metadata = { title: "Transactions" };

const TONE: Record<TransactionStatus, BadgeTone> = {
  completed: "success",
  pending: "info",
  processing: "info",
  failed: "danger",
  cancelled: "neutral",
  reversed: "warning",
};

const KINDS: TransactionKind[] = [
  "deposit",
  "withdrawal",
  "bet_stake",
  "bet_payout",
  "bonus",
  "refund",
  "adjustment",
];

interface PageProps {
  searchParams: Promise<Record<string, string | undefined>>;
}

export default async function AdminTransactionsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const list = parseListQuery(params);

  const [t, locale, transactions] = await Promise.all([
    getAdminT(),
    getRequestLocale(),
    getAdminTransactions({
      ...list,
      kind: params.kind as TransactionKind | undefined,
      status: params.status as TransactionStatus | undefined,
    }),
  ]);

  const rows: AdminRow[] = transactions.items.map((transaction) => ({
    id: transaction.id,
    cells: {
      reference: {
        text: transaction.reference,
        sub: t(`admin.txKind.${transaction.kind}`),
      },
      createdAt: { text: formatDateTime(transaction.createdAt, locale) },
      description: { text: t(transaction.descriptionKey, transaction.params) },
      amount: { text: formatAmount(transaction.amount, locale) },
      balanceAfter: { text: formatAmount(transaction.balanceAfter, locale) },
      status: {
        text: t(`wallet.status.${transaction.status}`),
        badge: {
          label: t(`wallet.status.${transaction.status}`),
          tone: TONE[transaction.status],
          dot: true,
        },
      },
    },
  }));

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-h1 text-ink">{t("admin.transactions.title")}</h1>
        <p className="mt-1 text-small text-ink-muted">
          {t("admin.transactions.description")}
        </p>
      </header>

      <AdminTableClient
        basePath="/admin/transactions"
        rows={rows}
        page={transactions.page}
        pageSize={transactions.pageSize}
        total={transactions.total}
        totalPages={transactions.totalPages}
        search={list.search}
        searchPlaceholder={t("admin.transactions.searchPlaceholder")}
        sort={list.sort}
        direction={list.direction}
        columns={[
          { key: "reference", header: t("admin.column.reference"), sortable: true },
          {
            key: "createdAt",
            header: t("wallet.column.date"),
            numeric: true,
            sortable: true,
          },
          { key: "description", header: t("wallet.column.description"), secondary: true },
          {
            key: "amount",
            header: t("wallet.column.amount"),
            numeric: true,
            align: "end",
            sortable: true,
          },
          {
            key: "balanceAfter",
            header: t("wallet.column.balance"),
            numeric: true,
            align: "end",
            secondary: true,
          },
          { key: "status", header: t("admin.column.status"), align: "end" },
        ]}
        filters={[
          {
            param: "kind",
            label: t("admin.column.kind"),
            value: params.kind,
            options: KINDS.map((value) => ({
              value,
              label: t(`admin.txKind.${value}`),
            })),
          },
          {
            param: "status",
            label: t("admin.column.status"),
            value: params.status,
            options: (
              ["completed", "pending", "processing", "failed", "cancelled", "reversed"] as const
            ).map((value) => ({ value, label: t(`wallet.status.${value}`) })),
          },
        ]}
      />
    </div>
  );
}
