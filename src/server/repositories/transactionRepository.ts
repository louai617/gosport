import "server-only";

import type { Prisma, TransactionStatus as DbStatus, TransactionType } from "@prisma/client";

import { JURISDICTION } from "@/config/app.config";
import { fromBig, toBig, toMillimes } from "@/lib/money";
import { isDemo } from "@/server/env";
import { prisma } from "@/server/db";
import { clampPage, cleanSearch, containsCI, type SortDirection } from "./filters";
import type {
  AdminTransaction,
  Paginated,
  Transaction,
  TransactionKind,
  TransactionStatus,
} from "@/types";

/**
 * Ledger reads. The same query builder serves the player's own history and the
 * operator's platform-wide view; what differs is the mapper — the player's never
 * contains the internal reason, the actor or the owner's username.
 */

export interface TransactionQueryInput {
  /** Pin to one player. Player-facing callers always set this from the session. */
  userId?: string;
  /** Limits an operator's view to the accounts they may see (a manager's own book). */
  userScope?: Prisma.UserWhereInput;
  kinds?: TransactionKind[];
  statuses?: TransactionStatus[];
  from?: Date;
  to?: Date;
  /** Absolute magnitude in TND, either bound optional. */
  minAmount?: number;
  maxAmount?: number;
  /** Matches reference, description — and, for operators, the username. */
  search?: string;
  searchUsers?: boolean;
  page?: number;
  pageSize?: number;
  sort?: string;
  direction?: SortDirection;
}

const SORTABLE = {
  createdAt: "createdAt",
  amount: "amount",
  type: "type",
  status: "status",
  balanceAfter: "balanceAfter",
} as const;

function toDbType(kind: TransactionKind): TransactionType {
  return kind.toUpperCase() as TransactionType;
}

function toDbStatus(status: TransactionStatus): DbStatus {
  return status.toUpperCase() as DbStatus;
}

export function buildTransactionWhere(q: TransactionQueryInput): Prisma.TransactionWhereInput {
  const and: Prisma.TransactionWhereInput[] = [];

  if (q.userId) and.push({ userId: q.userId });
  if (q.userScope) and.push({ user: q.userScope });
  if (q.kinds?.length) and.push({ type: { in: q.kinds.map(toDbType) } });
  if (q.statuses?.length) and.push({ status: { in: q.statuses.map(toDbStatus) } });
  if (q.from || q.to) {
    and.push({ createdAt: { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lte: q.to } : {}) } });
  }

  // Magnitude, regardless of sign: "show me everything over 100" means both
  // a 150 credit and a −150 debit.
  if (q.minAmount !== undefined || q.maxAmount !== undefined) {
    const min = q.minAmount !== undefined ? toBig(toMillimes(q.minAmount)) : undefined;
    const max = q.maxAmount !== undefined ? toBig(toMillimes(q.maxAmount)) : undefined;
    and.push({
      OR: [
        { amount: { ...(min !== undefined ? { gte: min } : {}), ...(max !== undefined ? { lte: max } : {}) } },
        {
          amount: {
            ...(max !== undefined ? { gte: -max } : {}),
            ...(min !== undefined ? { lte: -min } : {}),
          },
        },
      ],
    });
  }

  const search = cleanSearch(q.search);
  if (search) {
    const or: Prisma.TransactionWhereInput[] = [
      { reference: containsCI(search) },
      { description: containsCI(search) },
      { id: search },
    ];
    if (q.searchUsers) {
      or.push({ user: { username: containsCI(search) } });
    }
    and.push({ OR: or });
  }

  return and.length ? { AND: and } : {};
}

const include = {
  bet: { select: { reference: true } },
  user: { select: { username: true } },
} satisfies Prisma.TransactionInclude;

type Row = Prisma.TransactionGetPayload<{ include: typeof include }>;

interface Meta {
  descriptionKey?: string;
  params?: Record<string, string | number>;
  externalReference?: string;
  reason?: string;
}

function meta(row: Row): Meta {
  return (row.metadata && typeof row.metadata === "object" ? row.metadata : {}) as Meta;
}

/** Player-safe: no reason, no actor, no owner username. */
export function toPlayerTransaction(row: Row): Transaction {
  const m = meta(row);
  return {
    id: row.id,
    reference: row.reference,
    userId: row.userId,
    kind: row.type.toLowerCase() as TransactionKind,
    status: row.status.toLowerCase() as TransactionStatus,
    amount: fromBig(row.amount) / 1000,
    currency: JURISDICTION.currency,
    balanceBefore: fromBig(row.balanceBefore) / 1000,
    balanceAfter: fromBig(row.balanceAfter) / 1000,
    descriptionKey: m.descriptionKey,
    params: m.params,
    description: row.description,
    externalReference: m.externalReference ?? null,
    betReference: row.bet?.reference ?? null,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.settledAt?.toISOString() ?? null,
    simulated: isDemo,
  };
}

export function toAdminTransaction(
  row: Row,
  actorNames: Map<string, string>,
): AdminTransaction {
  const m = meta(row);
  return {
    ...toPlayerTransaction(row),
    username: row.user.username,
    createdByUsername: row.createdById ? (actorNames.get(row.createdById) ?? null) : null,
    reason: m.reason ?? null,
  };
}

async function actorNamesFor(rows: Row[]): Promise<Map<string, string>> {
  const ids = [...new Set(rows.map((row) => row.createdById).filter((id): id is string => !!id))];
  if (ids.length === 0) return new Map();
  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, username: true },
  });
  return new Map(users.map((user) => [user.id, user.username]));
}

async function query(q: TransactionQueryInput) {
  const where = buildTransactionWhere(q);
  const { page, pageSize, skip, take } = clampPage(q.page, q.pageSize);
  const field = SORTABLE[(q.sort ?? "createdAt") as keyof typeof SORTABLE] ?? "createdAt";
  const direction = q.direction ?? "desc";

  const [rows, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      include,
      // `id` as the tiebreaker keeps pagination stable when many rows share a timestamp.
      orderBy: [{ [field]: direction }, { id: "desc" }],
      skip,
      take,
    }),
    prisma.transaction.count({ where }),
  ]);

  return { rows, total, page, pageSize };
}

function paginated<T>(items: T[], total: number, page: number, pageSize: number): Paginated<T> {
  return { items, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function listPlayerTransactions(q: TransactionQueryInput): Promise<Paginated<Transaction>> {
  if (!q.userId) throw new Error("player transaction queries must be pinned to a user");
  const { rows, total, page, pageSize } = await query(q);
  return paginated(rows.map(toPlayerTransaction), total, page, pageSize);
}

export async function listAdminTransactions(
  q: TransactionQueryInput,
): Promise<Paginated<AdminTransaction>> {
  const { rows, total, page, pageSize } = await query({ ...q, searchUsers: true });
  const names = await actorNamesFor(rows);
  return paginated(
    rows.map((row) => toAdminTransaction(row, names)),
    total,
    page,
    pageSize,
  );
}

export { query as rawTransactionQuery };
