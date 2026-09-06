"use client";

import { ArrowDownLeft, ArrowUpRight, Wallet } from "lucide-react";
import type { Paginated, Transaction, TransactionStatus } from "@/types";
import { cn } from "@/lib/cn";
import { formatAmount, formatDateTime } from "@/lib/format";
import { useI18n } from "@/i18n/I18nProvider";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { SimulatedBadge } from "@/components/ui/SimulatedBadge";
import { TBody, TD, TH, THead, TR, Table, TableEmpty } from "@/components/ui/Table";

export interface TransactionTableProps {
  transactions: Paginated<Transaction> | { items: Transaction[] };
  compact?: boolean;
}

const STATUS_TONE: Record<TransactionStatus, BadgeTone> = {
  completed: "success",
  pending: "info",
  processing: "info",
  failed: "danger",
  cancelled: "neutral",
  reversed: "warning",
};

export function TransactionTable({ transactions, compact = false }: TransactionTableProps) {
  const { t, locale } = useI18n();
  const items = transactions.items;

  return (
    <div className="space-y-3">
      {!compact ? (
        <div className="flex justify-end">
          <SimulatedBadge variant="block" />
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-line bg-surface">
        <Table>
          <THead>
            <tr>
              <TH>{t("wallet.column.date")}</TH>
              <TH>{t("wallet.column.description")}</TH>
              <TH align="end">{t("wallet.column.amount")}</TH>
              {!compact ? <TH align="end">{t("wallet.column.balance")}</TH> : null}
              <TH align="end">{t("wallet.column.status")}</TH>
            </tr>
          </THead>

          <TBody>
            {items.length === 0 ? (
              <TableEmpty
                colSpan={compact ? 4 : 5}
                icon={<Wallet size={18} aria-hidden="true" />}
                title={t("empty.noTransactions")}
              />
            ) : (
              items.map((transaction) => {
                const credit = transaction.amount > 0;

                return (
                  <TR key={transaction.id}>
                    <TD>
                      <span className="numeric block whitespace-nowrap text-caption normal-case tracking-normal text-ink-muted">
                        {formatDateTime(transaction.createdAt, locale)}
                      </span>
                      <span className="numeric block text-caption normal-case tracking-normal text-ink-subtle">
                        {transaction.reference}
                      </span>
                    </TD>

                    <TD>
                      <span className="flex items-center gap-2">
                        <span
                          aria-hidden="true"
                          className={cn(
                            "grid size-6 shrink-0 place-items-center rounded-md",
                            credit ? "bg-success-soft text-success" : "bg-surface-3 text-ink-subtle",
                          )}
                        >
                          {credit ? (
                            <ArrowDownLeft size={13} className="flip-rtl" />
                          ) : (
                            <ArrowUpRight size={13} className="flip-rtl" />
                          )}
                        </span>
                        <span className="min-w-0 truncate">
                          {t(transaction.descriptionKey, transaction.params)}
                        </span>
                      </span>
                    </TD>

                    <TD align="end" numeric>
                      <span
                        className={cn(
                          "font-semibold",
                          credit ? "text-success" : "text-ink",
                        )}
                      >
                        {credit ? "+" : ""}
                        {formatAmount(transaction.amount, locale)}
                      </span>
                    </TD>

                    {!compact ? (
                      <TD align="end" numeric className="text-ink-muted">
                        {formatAmount(transaction.balanceAfter, locale)}
                      </TD>
                    ) : null}

                    <TD align="end">
                      <Badge tone={STATUS_TONE[transaction.status]} dot>
                        {t(`wallet.status.${transaction.status}`)}
                      </Badge>
                    </TD>
                  </TR>
                );
              })
            )}
          </TBody>
        </Table>
      </div>
    </div>
  );
}
