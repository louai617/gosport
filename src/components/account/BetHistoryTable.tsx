"use client";

import { useState } from "react";
import { Receipt } from "lucide-react";
import type { Bet, BetStatus, Paginated } from "@/types";
import { cn } from "@/lib/cn";
import { formatAmount, formatDateTime, formatOdds } from "@/lib/format";
import { useI18n } from "@/i18n/I18nProvider";
import { Chip } from "@/components/ui/Chip";
import { SimulatedBadge } from "@/components/ui/SimulatedBadge";
import {
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
  TableEmpty,
} from "@/components/ui/Table";
import { BetStatusBadge } from "./BetStatusBadge";

export interface BetHistoryTableProps {
  bets: Paginated<Bet>;
  /** Preselects a status filter; the "open bets" view passes "pending". */
  initialStatus?: BetStatus | "all";
}

const FILTERS: Array<BetStatus | "all"> = ["all", "pending", "won", "lost", "cancelled"];

const FILTER_LABELS: Record<string, string> = {
  all: "account.bets.filter.all",
  pending: "account.bets.status.pending",
  won: "account.bets.status.won",
  lost: "account.bets.status.lost",
  cancelled: "account.bets.status.cancelled",
};

/**
 * Bet history.
 *
 * A ticket is a parent row plus its legs, so each row expands rather than
 * repeating the ticket reference across five lines — which is what makes a
 * multiple unreadable in a flat table.
 */
export function BetHistoryTable({ bets, initialStatus = "all" }: BetHistoryTableProps) {
  const { t, locale } = useI18n();
  const [status, setStatus] = useState<BetStatus | "all">(initialStatus);
  const [expanded, setExpanded] = useState<string | null>(null);

  const visible =
    status === "all" ? bets.items : bets.items.filter((bet) => bet.status === status);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label={t("ui.filter")} className="flex flex-wrap gap-1.5">
          {FILTERS.map((value) => (
            <Chip
              key={value}
              active={status === value}
              onClick={() => setStatus(value)}
              count={
                value === "all"
                  ? bets.items.length
                  : bets.items.filter((bet) => bet.status === value).length
              }
            >
              {t(FILTER_LABELS[value] ?? value)}
            </Chip>
          ))}
        </div>
        <SimulatedBadge variant="block" />
      </div>

      <div className="overflow-hidden rounded-xl border border-line bg-surface">
        <Table>
          <THead>
            <tr>
              <TH>{t("account.bets.column.date")}</TH>
              <TH>{t("account.bets.column.event")}</TH>
              <TH>{t("account.bets.column.selection")}</TH>
              <TH align="end">{t("account.bets.column.odds")}</TH>
              <TH align="end">{t("account.bets.column.stake")}</TH>
              <TH align="end">{t("account.bets.column.return")}</TH>
              <TH align="end">{t("account.bets.column.status")}</TH>
            </tr>
          </THead>

          <TBody>
            {visible.length === 0 ? (
              <TableEmpty
                colSpan={7}
                icon={<Receipt size={18} aria-hidden="true" />}
                title={t("empty.noBets")}
                description={t("account.bets.emptyDescription")}
              />
            ) : (
              visible.flatMap((bet) => {
                const isOpen = expanded === bet.id;
                const multi = bet.selections.length > 1;
                const first = bet.selections[0];

                const rows = [
                  <TR
                    key={bet.id}
                    interactive={multi}
                    onClick={multi ? () => setExpanded(isOpen ? null : bet.id) : undefined}
                  >
                    <TD>
                      <span className="numeric block whitespace-nowrap text-caption normal-case tracking-normal text-ink-muted">
                        {formatDateTime(bet.placedAt, locale)}
                      </span>
                      <span className="numeric block text-caption normal-case tracking-normal text-ink-subtle">
                        {bet.reference}
                      </span>
                    </TD>

                    <TD>
                      <span className="block max-w-56 truncate">
                        {multi
                          ? t("account.bets.multipleLegs", { count: bet.selections.length })
                          : (first?.eventLabel ?? "—")}
                      </span>
                      <span className="block max-w-56 truncate text-caption normal-case tracking-normal text-ink-subtle">
                        {multi ? t(`betslip.mode.${bet.mode}`) : (first?.competitionLabel ?? "")}
                      </span>
                    </TD>

                    <TD>
                      <span className="block max-w-44 truncate">
                        {multi
                          ? t("account.bets.viewLegs")
                          : (first?.selectionLabel ?? "—")}
                      </span>
                    </TD>

                    <TD align="end" numeric>
                      {formatOdds(bet.totalOdds)}
                    </TD>
                    <TD align="end" numeric>
                      {formatAmount(bet.stake, locale)}
                    </TD>
                    <TD align="end" numeric>
                      <span
                        className={cn(
                          bet.status === "won" && "font-semibold text-success",
                          bet.status === "lost" && "text-ink-subtle",
                        )}
                      >
                        {formatAmount(bet.payout ?? bet.potentialReturn, locale)}
                      </span>
                    </TD>
                    <TD align="end">
                      <BetStatusBadge status={bet.status} />
                    </TD>
                  </TR>,
                ];

                if (multi && isOpen) {
                  rows.push(
                    <tr key={`${bet.id}-legs`} className="bg-surface-2/40">
                      <td colSpan={7} className="px-3 py-2">
                        <ul className="space-y-1.5">
                          {bet.selections.map((selection) => (
                            <li
                              key={selection.id}
                              className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-surface px-2.5 py-2"
                            >
                              <span className="min-w-0">
                                <span className="block truncate text-small text-ink">
                                  {selection.selectionLabel}
                                </span>
                                <span className="block truncate text-caption normal-case tracking-normal text-ink-subtle">
                                  {selection.eventLabel} · {t(selection.marketNameKey)}
                                </span>
                              </span>
                              <span className="flex items-center gap-3">
                                <span className="numeric text-small font-semibold text-ink">
                                  {formatOdds(selection.odds)}
                                </span>
                                <BetStatusBadge status={selection.status} />
                              </span>
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>,
                  );
                }

                return rows;
              })
            )}
          </TBody>
        </Table>
      </div>
    </div>
  );
}
