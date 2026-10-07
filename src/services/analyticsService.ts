import "server-only";

import type { Prisma, TransactionType } from "@prisma/client";

import type { PeriodQuery } from "@/lib/adminValidation";
import { fromBig } from "@/lib/money";
import { bucketIndex, bucketStarts, resolvePeriod, type ResolvedPeriod } from "@/lib/period";
import { prisma } from "@/server/db";
import { requirePermission } from "@/server/auth/guard";

/**
 * Operator analytics — every figure is computed from the ledger and the player
 * tables at request time. Nothing here is cached, seeded or hard-coded: an empty
 * database shows zeros.
 *
 * Each metric is labelled by what it *is*, because "deposits: 5" is meaningless
 * without saying whether that is TND, a count of transactions or a count of
 * players:
 *
 *   gross   — sum of the absolute value of the entries, TND
 *   net     — signed sum, TND
 *   count   — number of ledger entries (or tickets)
 *   players — number of *distinct* players involved
 *
 * Amounts are integer millimes inside this module and TND on the way out.
 */

export interface Flow {
  /** Sum of absolute amounts, TND. */
  gross: number;
  /** Number of ledger entries. */
  count: number;
  /** Distinct players. */
  players: number;
}

export interface DashboardData {
  period: {
    preset: string;
    from: string;
    to: string;
    fromDay: string;
    toDay: string;
    bucket: "hour" | "day";
  };
  players: {
    total: number;
    /** Registered in the period. */
    registered: number;
    /** Distinct players who signed in during the period. */
    signedIn: number;
    suspended: number;
    locked: number;
    invited: number;
  };
  /** Current sum of every player wallet — a point-in-time figure, not period-bound. */
  balances: { total: number };
  deposits: Flow;
  withdrawals: Flow;
  bets: Flow;
  wins: Flow;
  refunds: Flow;
  bonuses: Flow;
  adjustments: { credits: number; debits: number; net: number; count: number };
  revenue: {
    /** Stakes − payouts (wins + refunded stakes). */
    ggr: number;
    /** GGR − bonuses granted. */
    ngr: number;
    /** payouts ÷ stakes, as a fraction. Null when nothing was staked. */
    returnToPlayer: number | null;
  };
  pending: {
    withdrawals: { count: number; amount: number };
    approvals: number;
    openTickets: number;
    invitations: number;
  };
  series: {
    starts: string[];
    deposits: number[];
    withdrawals: number[];
    stakes: number[];
    payouts: number[];
    registrations: number[];
  };
  truncated: boolean;
}

const PLAYER = { user: { role: "PLAYER" as const } };
/** Safety valve for the in-memory bucketing below. */
const MAX_SERIES_ROWS = 250_000;

function emptyFlow(): Flow {
  return { gross: 0, count: 0, players: 0 };
}

function toFlow(rows: Array<{ type: TransactionType; _sum: { amount: bigint | null }; _count: number }>, players: number, ...types: TransactionType[]): Flow {
  const matched = rows.filter((row) => types.includes(row.type));
  if (matched.length === 0) return emptyFlow();
  return {
    gross: matched.reduce((sum, row) => sum + Math.abs(fromBig(row._sum.amount)), 0) / 1000,
    count: matched.reduce((sum, row) => sum + row._count, 0),
    players,
  };
}

export function periodFromQuery(query: Partial<PeriodQuery>): ResolvedPeriod {
  return resolvePeriod(query.period ?? "last7", { from: query.from, to: query.to });
}

export async function getDashboard(query: Partial<PeriodQuery> = {}): Promise<DashboardData> {
  await requirePermission("dashboard.read");
  const period = periodFromQuery(query);
  const range = { gte: period.from, lt: period.to };

  const inPeriod: Prisma.TransactionWhereInput = {
    ...PLAYER,
    status: "COMPLETED",
    createdAt: range,
    // The REFUND that returns a rejected withdrawal is a reversal, not a player refund.
    relatedId: null,
  };

  const [
    totalPlayers,
    registered,
    suspended,
    locked,
    invited,
    signIns,
    balanceSum,
    byType,
    pairs,
    betRefunds,
    pendingWithdrawals,
    pendingApprovals,
    openTickets,
    betTickets,
  ] = await Promise.all([
    prisma.user.count({ where: { role: "PLAYER" } }),
    prisma.user.count({ where: { role: "PLAYER", createdAt: range } }),
    prisma.user.count({ where: { role: "PLAYER", status: "SUSPENDED" } }),
    prisma.user.count({ where: { role: "PLAYER", status: "LOCKED" } }),
    prisma.user.count({ where: { role: "PLAYER", status: "PENDING" } }),
    prisma.session.groupBy({
      by: ["userId"],
      where: { createdAt: range, user: { role: "PLAYER" } },
    }),
    prisma.wallet.aggregate({ where: { user: { role: "PLAYER" } }, _sum: { balance: true } }),
    prisma.transaction.groupBy({
      by: ["type"],
      where: inPeriod,
      _sum: { amount: true },
      _count: true,
    }),
    prisma.transaction.groupBy({ by: ["type", "userId"], where: inPeriod }),
    prisma.transaction.aggregate({
      where: { ...inPeriod, type: "REFUND", betId: { not: null } },
      _sum: { amount: true },
    }),
    prisma.transaction.aggregate({
      where: { type: "WITHDRAWAL", status: "PENDING", user: { role: "PLAYER" } },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.adjustmentRequest.count({ where: { status: "PENDING" } }),
    prisma.bet.count({ where: { status: "OPEN", kind: "SPORTS" } }),
    prisma.bet.count({ where: { placedAt: range } }),
  ]);

  const uniqueBy = (type: TransactionType) => pairs.filter((pair) => pair.type === type).length;
  const uniqueOf = (...types: TransactionType[]) =>
    new Set(pairs.filter((pair) => types.includes(pair.type)).map((pair) => pair.userId)).size;

  const deposits = toFlow(byType, uniqueBy("DEPOSIT"), "DEPOSIT");
  const withdrawals = toFlow(byType, uniqueBy("WITHDRAWAL"), "WITHDRAWAL");
  const bets = toFlow(byType, uniqueBy("BET"), "BET");
  // Tickets and rounds placed, not ledger debits — a double-down is a second
  // debit on the same round.
  bets.count = betTickets;
  const wins = toFlow(byType, uniqueBy("WIN"), "WIN");
  const refunds = toFlow(byType, uniqueBy("REFUND"), "REFUND");
  const bonuses = toFlow(byType, uniqueBy("BONUS"), "BONUS");

  const sumOf = (type: TransactionType) =>
    fromBig(byType.find((row) => row.type === type)?._sum.amount);
  const credits = sumOf("ADMIN_CREDIT");
  const debits = Math.abs(sumOf("ADMIN_DEBIT"));
  const adjustmentSigned = sumOf("ADJUSTMENT");
  const adjustmentRows = byType
    .filter((row) => ["ADMIN_CREDIT", "ADMIN_DEBIT", "ADJUSTMENT"].includes(row.type))
    .reduce((sum, row) => sum + row._count, 0);

  const stakes = bets.gross;
  const payouts = wins.gross + Math.abs(fromBig(betRefunds._sum.amount)) / 1000;
  const ggr = stakes - payouts;

  const series = await buildSeries(period);


  return {
    period: {
      preset: period.preset,
      from: period.from.toISOString(),
      to: period.to.toISOString(),
      fromDay: period.fromDay,
      toDay: period.toDay,
      bucket: period.bucket,
    },
    players: {
      total: totalPlayers,
      registered,
      signedIn: signIns.length,
      suspended,
      locked,
      invited,
    },
    balances: { total: fromBig(balanceSum._sum.balance) / 1000 },
    deposits,
    withdrawals,
    bets,
    wins,
    refunds,
    bonuses,
    adjustments: {
      credits: credits / 1000,
      debits: debits / 1000,
      net: (credits - debits + adjustmentSigned) / 1000,
      count: adjustmentRows,
    },
    revenue: {
      ggr,
      ngr: ggr - bonuses.gross,
      returnToPlayer: stakes > 0 ? payouts / stakes : null,
    },
    pending: {
      withdrawals: {
        count: pendingWithdrawals._count,
        amount: Math.abs(fromBig(pendingWithdrawals._sum.amount)) / 1000,
      },
      approvals: pendingApprovals,
      openTickets,
      invitations: invited,
    },
    series: series.series,
    truncated: series.truncated,
  };
}

async function buildSeries(period: ResolvedPeriod) {
  const starts = bucketStarts(period);
  const size = starts.length;
  const zeros = () => new Array<number>(size).fill(0);
  const series = {
    starts: starts.map((start) => start.toISOString()),
    deposits: zeros(),
    withdrawals: zeros(),
    stakes: zeros(),
    payouts: zeros(),
    registrations: zeros(),
  };

  const rows = await prisma.transaction.findMany({
    where: {
      ...PLAYER,
      status: "COMPLETED",
      createdAt: { gte: period.from, lt: period.to },
      type: { in: ["DEPOSIT", "WITHDRAWAL", "BET", "WIN", "REFUND"] },
      relatedId: null,
    },
    select: { createdAt: true, type: true, amount: true, betId: true },
    orderBy: { createdAt: "asc" },
    take: MAX_SERIES_ROWS + 1,
  });
  const truncated = rows.length > MAX_SERIES_ROWS;

  for (const row of rows.slice(0, MAX_SERIES_ROWS)) {
    const index = bucketIndex(starts, row.createdAt);
    const amount = Math.abs(fromBig(row.amount)) / 1000;
    if (row.type === "DEPOSIT") series.deposits[index]! += amount;
    else if (row.type === "WITHDRAWAL") series.withdrawals[index]! += amount;
    else if (row.type === "BET") series.stakes[index]! += amount;
    else if (row.type === "WIN" || (row.type === "REFUND" && row.betId)) {
      series.payouts[index]! += amount;
    }
  }

  const joined = await prisma.user.findMany({
    where: { role: "PLAYER", createdAt: { gte: period.from, lt: period.to } },
    select: { createdAt: true },
    take: MAX_SERIES_ROWS,
  });
  for (const user of joined) series.registrations[bucketIndex(starts, user.createdAt)]! += 1;

  return { series, truncated };
}

/* ------------------------------------------------------------ recent activity */

export interface ActivityItem {
  id: string;
  at: string;
  kind: "audit" | "ledger";
  /** i18n key suffix for the label: an audit action or a ledger type. */
  code: string;
  username: string | null;
  amount: number | null;
  severity: "info" | "warning" | "critical";
  /** Where clicking it goes: the player, or the transaction. */
  href: string | null;
}

/** Audit events that make sense in a "what is happening" feed. */
const FEED_ACTIONS = [
  "auth.register",
  "auth.login",
  "auth.logout",
  "auth.account_locked",
  "admin.player.created",
  "admin.player.suspended",
  "admin.player.reactivated",
  "admin.player.locked",
  "admin.player.unlocked",
  "admin.player.updated",
  "admin.player.restrictions_changed",
  "admin.wallet.adjusted",
  "admin.wallet.adjustment_approved",
  "admin.withdrawal.approved",
  "admin.withdrawal.rejected",
  "wallet.withdrawal_requested",
  "player.profile_updated",
];

export async function getRecentActivity(limit = 25): Promise<ActivityItem[]> {
  await requirePermission("dashboard.read");
  const take = Math.min(Math.max(limit, 1), 100);

  const [audits, ledger] = await Promise.all([
    prisma.auditLog.findMany({
      where: { action: { in: FEED_ACTIONS } },
      include: { target: { select: { username: true } }, actor: { select: { username: true } } },
      orderBy: { createdAt: "desc" },
      take,
    }),
    prisma.transaction.findMany({
      where: { type: { in: ["BET", "WIN", "DEPOSIT", "WITHDRAWAL", "BONUS", "REFUND"] } },
      include: { user: { select: { username: true } } },
      orderBy: { createdAt: "desc" },
      take,
    }),
  ]);

  const items: ActivityItem[] = [
    ...audits
      // An admin's adjustment is already a ledger line; show it once, as the ledger entry.
      .filter((row) => row.action !== "admin.wallet.adjusted")
      .map(
        (row): ActivityItem => ({
          id: `a:${row.id}`,
          at: row.createdAt.toISOString(),
          kind: "audit",
          code: row.action,
          username: row.target?.username ?? row.actor?.username ?? null,
          amount: null,
          severity: row.severity.toLowerCase() as ActivityItem["severity"],
          href: row.targetUserId ? `/admin/players/${row.targetUserId}` : null,
        }),
      ),
    ...ledger.map(
      (row): ActivityItem => ({
        id: `t:${row.id}`,
        at: row.createdAt.toISOString(),
        kind: "ledger",
        code: row.type,
        username: row.user.username,
        amount: fromBig(row.amount) / 1000,
        severity: "info",
        href: `/admin/transactions?search=${row.reference}`,
      }),
    ),
  ];

  return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, take);
}
