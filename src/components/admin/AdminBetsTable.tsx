"use client";

import { useState } from "react";
import Link from "next/link";
import { Receipt } from "lucide-react";
import type { AdminBet } from "@/services/bettingService";
import { settleBetAction } from "@/app/actions/admin";
import { settleTicket } from "@/lib/settlement";
import { formatAmount, formatDateTime, formatOdds } from "@/lib/format";
import { toMillimes } from "@/lib/money";
import { useI18n } from "@/i18n/I18nProvider";
import { BetStatusBadge } from "@/components/account/BetStatusBadge";
import { Checkbox } from "@/components/ui/Checkbox";
import { Select } from "@/components/ui/Select";
import { TBody, TD, TH, THead, TR, Table, TableEmpty } from "@/components/ui/Table";
import { ActionForm } from "./ActionForm";

export interface AdminBetsTableProps {
  bets: AdminBet[];
  canSettle: boolean;
  showPlayer?: boolean;
}

/**
 * Tickets and casino rounds. An open sports ticket expands into a settlement
 * form: one result per leg, a live preview of the payout the server will compute
 * (the same pure function), and an explicit confirmation. Casino rounds settle
 * themselves on the server and are read-only here.
 */
export function AdminBetsTable({ bets, canSettle, showPlayer = true }: AdminBetsTableProps) {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState<string | null>(null);
  const columns = showPlayer ? 8 : 7;

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      <Table>
        <THead>
          <tr>
            <TH>{t("account.bets.column.date")}</TH>
            {showPlayer ? <TH>{t("admin.column.player")}</TH> : null}
            <TH>{t("account.bets.column.event")}</TH>
            <TH>{t("admin.column.kind")}</TH>
            <TH align="end">{t("account.bets.column.stake")}</TH>
            <TH align="end">{t("account.bets.column.return")}</TH>
            <TH align="end">{t("account.bets.column.status")}</TH>
            <TH align="end">{""}</TH>
          </tr>
        </THead>
        <TBody>
          {bets.length === 0 ? (
            <TableEmpty colSpan={columns + (showPlayer ? 0 : 1)} icon={<Receipt size={18} aria-hidden="true" />} title={t("empty.noBets")} />
          ) : (
            bets.flatMap((bet) => {
              const casino = bet.kind === "casino";
              const settleable = canSettle && !casino && bet.status === "pending";
              const rows = [
                <TR key={bet.id}>
                  <TD>
                    <span className="numeric block whitespace-nowrap text-caption normal-case tracking-normal text-ink-muted">
                      {formatDateTime(bet.placedAt, locale)}
                    </span>
                    <span className="numeric block text-caption normal-case tracking-normal text-ink-subtle">{bet.reference}</span>
                  </TD>
                  {showPlayer ? (
                    <TD>
                      <Link href={`/admin/players/${bet.userId}`} className="font-medium text-primary underline-offset-2 hover:underline">
                        {bet.username}
                      </Link>
                    </TD>
                  ) : null}
                  <TD>
                    <span className="block max-w-56 truncate">
                      {casino ? t(`games.title.${bet.gameKey}`) : bet.selections.length > 1 ? t("account.bets.multipleLegs", { count: bet.selections.length }) : (bet.selections[0]?.eventLabel ?? "—")}
                    </span>
                  </TD>
                  <TD>{casino ? t("account.bets.casinoRound") : t(`betslip.mode.${bet.mode}`)}</TD>
                  <TD align="end" numeric>{formatAmount(bet.stake, locale)}</TD>
                  <TD align="end" numeric>{formatAmount(bet.payout ?? bet.potentialReturn, locale)}</TD>
                  <TD align="end"><BetStatusBadge status={bet.status} /></TD>
                  <TD align="end">
                    {settleable ? (
                      <button
                        type="button"
                        onClick={() => setOpen(open === bet.id ? null : bet.id)}
                        className="cursor-pointer text-small font-semibold text-primary hover:underline"
                      >
                        {open === bet.id ? t("ui.close") : t("admin.bets.settle")}
                      </button>
                    ) : null}
                  </TD>
                </TR>,
              ];

              if (settleable && open === bet.id) {
                rows.push(
                  <tr key={`${bet.id}-settle`} className="bg-surface-2/40">
                    <td colSpan={columns + (showPlayer ? 0 : 1)} className="px-4 py-4">
                      <SettleForm bet={bet} />
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
  );
}

function SettleForm({ bet }: { bet: AdminBet }) {
  const { t, locale } = useI18n();
  const [results, setResults] = useState<Record<string, "WON" | "LOST" | "VOID" | "">>(
    Object.fromEntries(bet.legIds.map((id) => [id, ""])),
  );

  const complete = bet.legIds.every((id) => results[id]);
  const preview = complete
    ? settleTicket(
        bet.mode,
        toMillimes(bet.stake),
        bet.selections.map((selection, index) => ({
          oddsMilli: Math.round(selection.odds * 1000),
          result: results[bet.legIds[index]!] as "WON" | "LOST" | "VOID",
        })),
        bet.systemSize,
      )
    : null;

  return (
    <ActionForm action={settleBetAction} submitLabel={t("admin.bets.confirmSettle")} className="space-y-3">
      {({ error }) => (
        <>
          <input type="hidden" name="betId" value={bet.id} />
          <ul className="space-y-2">
            {bet.selections.map((selection, index) => {
              const legId = bet.legIds[index]!;
              return (
                <li key={legId} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line-soft bg-surface px-3 py-2">
                  <span className="min-w-0">
                    <span className="block truncate text-small text-ink">
                      {selection.selectionLabelKey
                        ? t(selection.selectionLabelKey, selection.marketLine === undefined ? undefined : { line: selection.marketLine })
                        : selection.selectionLabel}
                    </span>
                    <span className="block truncate text-caption normal-case tracking-normal text-ink-subtle">
                      {selection.eventLabel} · {t(selection.marketNameKey)} · {formatOdds(selection.odds)}
                    </span>
                  </span>
                  <div className="w-36">
                    <Select
                      name={`leg:${legId}`}
                      value={results[legId]}
                      onChange={(event) => setResults((prev) => ({ ...prev, [legId]: event.target.value as "WON" }))}
                      selectSize="sm"
                      aria-label={t("admin.bets.legResult")}
                      options={[
                        { value: "", label: t("admin.bets.choose"), disabled: true },
                        { value: "WON", label: t("account.bets.status.won") },
                        { value: "LOST", label: t("account.bets.status.lost") },
                        { value: "VOID", label: t("account.bets.status.void") },
                      ]}
                    />
                  </div>
                </li>
              );
            })}
          </ul>

          <p className="numeric text-small text-ink-muted" aria-live="polite">
            {preview
              ? t("admin.bets.preview", {
                  status: t(`account.bets.status.${preview.status.toLowerCase()}`),
                  payout: formatAmount(preview.payoutMillimes / 1000, locale),
                })
              : t("admin.bets.previewPending")}
          </p>
          {error("results") ? <p role="alert" className="text-small text-danger">{error("results")}</p> : null}
          <Checkbox name="confirm" label={t("admin.bets.confirmLabel", { reference: bet.reference })} error={error("confirm")} />
        </>
      )}
    </ActionForm>
  );
}
