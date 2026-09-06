import type { Metadata } from "next";
import type { BetStatus } from "@/types";
import { getAdminBets } from "@/services/adminService";
import { getAdminT, getRequestLocale } from "@/i18n/server";
import { formatAmount, formatDateTime, formatOdds } from "@/lib/format";
import { AdminTableClient, type AdminRow } from "@/components/admin/AdminTableClient";
import { parseListQuery } from "@/lib/listQuery";
import type { BadgeTone } from "@/components/ui/Badge";

export const metadata: Metadata = { title: "Bets" };

const TONE: Record<BetStatus, BadgeTone> = {
  won: "success",
  lost: "danger",
  pending: "info",
  cancelled: "neutral",
  void: "neutral",
  cashed_out: "warning",
};

const LABEL: Record<BetStatus, string> = {
  won: "account.bets.status.won",
  lost: "account.bets.status.lost",
  pending: "account.bets.status.pending",
  cancelled: "account.bets.status.cancelled",
  void: "account.bets.status.void",
  cashed_out: "account.bets.status.cashedOut",
};

interface PageProps {
  searchParams: Promise<Record<string, string | undefined>>;
}

export default async function AdminBetsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const list = parseListQuery(params);

  const [t, locale, bets] = await Promise.all([
    getAdminT(),
    getRequestLocale(),
    getAdminBets({ ...list, status: params.status as BetStatus | undefined }),
  ]);

  const rows: AdminRow[] = bets.items.map((bet) => ({
    id: bet.id,
    cells: {
      reference: {
        text: bet.reference,
        sub: t(`betslip.mode.${bet.mode}`),
      },
      placedAt: { text: formatDateTime(bet.placedAt, locale) },
      selections: {
        text: String(bet.selections.length),
        sub: bet.selections[0]?.eventLabel,
      },
      odds: { text: formatOdds(bet.totalOdds) },
      stake: { text: formatAmount(bet.stake, locale) },
      payout: {
        text: formatAmount(bet.payout ?? bet.potentialReturn, locale),
      },
      status: {
        text: t(LABEL[bet.status]),
        badge: { label: t(LABEL[bet.status]), tone: TONE[bet.status], dot: true },
      },
    },
  }));

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-h1 text-ink">{t("admin.bets.title")}</h1>
        <p className="mt-1 text-small text-ink-muted">{t("admin.bets.description")}</p>
      </header>

      <AdminTableClient
        basePath="/admin/bets"
        rows={rows}
        page={bets.page}
        pageSize={bets.pageSize}
        total={bets.total}
        totalPages={bets.totalPages}
        search={list.search}
        searchPlaceholder={t("admin.bets.searchPlaceholder")}
        sort={list.sort}
        direction={list.direction}
        columns={[
          { key: "reference", header: t("admin.column.reference"), sortable: true },
          {
            key: "placedAt",
            header: t("admin.column.placedAt"),
            numeric: true,
            sortable: true,
            secondary: true,
          },
          { key: "selections", header: t("admin.column.selections"), secondary: true },
          { key: "odds", header: t("account.bets.column.odds"), numeric: true, align: "end" },
          {
            key: "stake",
            header: t("account.bets.column.stake"),
            numeric: true,
            align: "end",
            sortable: true,
          },
          {
            key: "payout",
            header: t("account.bets.column.return"),
            numeric: true,
            align: "end",
            secondary: true,
          },
          { key: "status", header: t("admin.column.status"), align: "end" },
        ]}
        filters={[
          {
            param: "status",
            label: t("admin.column.status"),
            value: params.status,
            options: (
              ["pending", "won", "lost", "cancelled", "void", "cashed_out"] as const
            ).map((value) => ({ value, label: t(LABEL[value]) })),
          },
        ]}
      />
    </div>
  );
}
