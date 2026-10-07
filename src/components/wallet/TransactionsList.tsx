"use client";

import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import type { AdminTransaction, Paginated, Transaction, TransactionKind, TransactionStatus } from "@/types";
import { cn } from "@/lib/cn";
import { formatAmount, formatDateTime } from "@/lib/format";
import { useI18n } from "@/i18n/I18nProvider";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import {
  DataTable,
  type DataTableColumn,
  type DataTableFilter,
  type DataTableInput,
} from "@/components/admin/DataTable";

export const TRANSACTION_STATUS_TONE: Record<TransactionStatus, BadgeTone> = {
  completed: "success",
  pending: "info",
  failed: "danger",
  cancelled: "neutral",
  reversed: "warning",
};

const KINDS: TransactionKind[] = [
  "deposit",
  "withdrawal",
  "bet",
  "win",
  "refund",
  "bonus",
  "admin_credit",
  "admin_debit",
  "adjustment",
];

const STATUSES: TransactionStatus[] = ["completed", "pending", "reversed", "failed", "cancelled"];

export interface TransactionsListProps {
  basePath: string;
  /** `admin` adds the owner and the internal reason; the player view never receives them. */
  variant: "player" | "admin";
  data: Paginated<Transaction | AdminTransaction>;
  params: {
    search?: string;
    kind?: string;
    status?: string;
    from?: string;
    to?: string;
    minAmount?: string;
    maxAmount?: string;
    sort?: string;
    direction?: "asc" | "desc";
    userId?: string;
  };
  toolbar?: React.ReactNode;
}

function isAdminTransaction(row: Transaction | AdminTransaction): row is AdminTransaction {
  return "username" in row;
}

/**
 * The transaction table, shared by the player's history and the operator's
 * ledger: search, type, status, date range, amount range, sorting and
 * pagination, all driven by the URL so a view can be shared and the back button
 * works. What differs between the two is only the data the server hands it — the
 * player's rows never contain the internal reason or the actor, so this
 * component has nothing to leak.
 */
export function TransactionsList({ basePath, variant, data, params, toolbar }: TransactionsListProps) {
  const { t, locale } = useI18n();
  const admin = variant === "admin";

  const describe = (row: Transaction) =>
    row.descriptionKey ? t(row.descriptionKey, row.params) : (row.description ?? "—");

  const columns: DataTableColumn<Transaction | AdminTransaction>[] = [
    {
      key: "createdAt",
      header: t("wallet.column.date"),
      sortable: true,
      numeric: true,
      render: (row) => (
        <span className="block">
          <span className="block whitespace-nowrap text-caption normal-case tracking-normal text-ink-muted">
            {formatDateTime(row.createdAt, locale)}
          </span>
          <span className="block text-caption normal-case tracking-normal text-ink-subtle">
            {row.reference}
          </span>
        </span>
      ),
    },
    ...(admin
      ? [
          {
            key: "player",
            header: t("admin.column.player"),
            render: (row: Transaction | AdminTransaction) =>
              isAdminTransaction(row) ? (
                <Link
                  href={`/admin/players/${row.userId}`}
                  className="font-medium text-primary underline-offset-2 hover:underline"
                >
                  {row.username}
                </Link>
              ) : null,
          } satisfies DataTableColumn<Transaction | AdminTransaction>,
        ]
      : []),
    {
      key: "type",
      header: t("admin.column.kind"),
      sortable: true,
      render: (row) => {
        const credit = row.amount > 0;
        return (
          <span className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className={cn(
                "grid size-6 shrink-0 place-items-center rounded-md",
                credit ? "bg-success-soft text-success" : "bg-surface-3 text-ink-subtle",
              )}
            >
              {credit ? <ArrowDownLeft size={13} className="flip-rtl" /> : <ArrowUpRight size={13} className="flip-rtl" />}
            </span>
            <span className="min-w-0">
              <span className="block truncate">{t(`wallet.kind.${row.kind}`)}</span>
              {row.betReference ? (
                <span className="block truncate text-caption normal-case tracking-normal text-ink-subtle">
                  {row.betReference}
                </span>
              ) : null}
            </span>
          </span>
        );
      },
    },
    {
      key: "description",
      header: t("wallet.column.description"),
      secondary: true,
      render: (row) => (
        <span className="block max-w-64">
          <span className="block truncate">{describe(row)}</span>
          {row.externalReference ? (
            <span className="block truncate text-caption normal-case tracking-normal text-ink-subtle">
              {t("wallet.column.externalReference")}: {row.externalReference}
            </span>
          ) : null}
          {isAdminTransaction(row) && (row.reason || row.createdByUsername) ? (
            <span className="block truncate text-caption normal-case tracking-normal text-ink-subtle">
              {row.createdByUsername ? `${row.createdByUsername} · ` : ""}
              {row.reason ?? ""}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: "amount",
      header: t("wallet.column.amount"),
      sortable: true,
      numeric: true,
      align: "end",
      render: (row) => (
        <span className={cn("font-semibold", row.amount > 0 ? "text-success" : "text-ink")}>
          {row.amount > 0 ? "+" : ""}
          {formatAmount(row.amount, locale)}
        </span>
      ),
    },
    {
      key: "balanceAfter",
      header: t("wallet.column.balance"),
      sortable: true,
      numeric: true,
      align: "end",
      secondary: true,
      render: (row) => <span className="text-ink-muted">{formatAmount(row.balanceAfter, locale)}</span>,
    },
    {
      key: "status",
      header: t("wallet.column.status"),
      sortable: true,
      align: "end",
      render: (row) => (
        <Badge tone={TRANSACTION_STATUS_TONE[row.status]} dot>
          {t(`wallet.status.${row.status}`)}
        </Badge>
      ),
    },
  ];

  const filters: DataTableFilter[] = [
    {
      param: "kind",
      label: t("admin.column.kind"),
      value: params.kind,
      options: KINDS.map((value) => ({ value, label: t(`wallet.kind.${value}`) })),
    },
    {
      param: "status",
      label: t("wallet.column.status"),
      value: params.status,
      options: STATUSES.map((value) => ({ value, label: t(`wallet.status.${value}`) })),
    },
  ];

  const inputs: DataTableInput[] = [
    { param: "from", label: t("admin.filter.from"), type: "date", value: params.from },
    { param: "to", label: t("admin.filter.to"), type: "date", value: params.to },
    { param: "minAmount", label: t("admin.filter.minAmount"), type: "number", value: params.minAmount, placeholder: "0" },
    { param: "maxAmount", label: t("admin.filter.maxAmount"), type: "number", value: params.maxAmount },
  ];

  return (
    <DataTable
      basePath={basePath}
      columns={columns}
      rowKey={(row) => row.id}
      data={data}
      searchValue={params.search}
      searchPlaceholder={t(admin ? "admin.transactions.searchPlaceholder" : "wallet.searchPlaceholder")}
      sort={params.sort}
      direction={params.direction ?? null}
      filters={filters}
      inputs={inputs}
      toolbar={toolbar}
      emptyTitle={t("empty.noTransactions")}
    />
  );
}
