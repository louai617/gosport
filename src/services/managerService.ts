import "server-only";

import type { Prisma } from "@prisma/client";

import { fromBig } from "@/lib/money";
import { prisma } from "@/server/db";
import { requirePermission } from "@/server/auth/guard";
import { managedManagerWhere } from "@/server/auth/scope";
import { effectiveStatus } from "@/server/auth/sessionUser";
import { clampPage, cleanSearch, containsCI } from "@/server/repositories/filters";
import type { AccountStatus, Paginated } from "@/types";

/**
 * The superadmin's view of the managers they have created: who they are, how
 * much credit they hold, how much they have sold, and how many players they run.
 * Everything is read through `managedManagerWhere`, so only a superadmin sees
 * anything at all.
 */

export interface ManagerRow {
  id: string;
  username: string;
  displayName: string;
  status: AccountStatus;
  /** Current credit balance (TND). */
  balance: number;
  playerCount: number;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface ManagerDetail extends ManagerRow {
  /** Credit the superadmin has issued to this manager, lifetime (TND). */
  issued: number;
  /** Credit this manager has sold to players, lifetime (TND). */
  sold: number;
  mustChangePassword: boolean;
  suspendedReason: string | null;
  activeSessions: number;
}

const include = () =>
  ({
    profile: { select: { displayName: true } },
    wallet: { select: { balance: true } },
    _count: { select: { createdUsers: true } },
  }) satisfies Prisma.UserInclude;

type Row = Prisma.UserGetPayload<{ include: ReturnType<typeof include> }>;

function toRow(row: Row): ManagerRow {
  return {
    id: row.id,
    username: row.username,
    displayName: row.profile?.displayName ?? row.username,
    status: effectiveStatus(row),
    balance: fromBig(row.wallet?.balance) / 1000,
    playerCount: row._count.createdUsers,
    createdAt: row.createdAt.toISOString(),
    lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
  };
}

export async function listManagers(
  query: { search?: string; page?: number; pageSize?: number } = {},
): Promise<Paginated<ManagerRow>> {
  const actor = await requirePermission("managers.read");

  const search = cleanSearch(query.search);
  const where: Prisma.UserWhereInput = {
    AND: [
      managedManagerWhere(actor),
      ...(search
        ? [{ OR: [{ id: search }, { username: containsCI(search) }, { profile: { displayName: containsCI(search) } }] }]
        : []),
    ],
  };

  const { page, pageSize, skip, take } = clampPage(query.page, query.pageSize);
  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where,
      include: include(),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip,
      take,
    }),
    prisma.user.count({ where }),
  ]);

  return {
    items: rows.map(toRow),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getManagerDetail(id: string): Promise<ManagerDetail | null> {
  const actor = await requirePermission("managers.read");
  const now = new Date();

  const row = await prisma.user.findFirst({
    where: { id, ...managedManagerWhere(actor) },
    include: include(),
  });
  if (!row) return null;

  const [issued, sold, sessions] = await Promise.all([
    prisma.transaction.aggregate({ where: { userId: id, type: "ADMIN_CREDIT" }, _sum: { amount: true } }),
    prisma.transaction.aggregate({ where: { userId: id, type: "CREDIT_TRANSFER" }, _sum: { amount: true } }),
    prisma.session.count({
      where: { userId: id, revokedAt: null, idleExpiresAt: { gt: now }, absoluteExpiresAt: { gt: now } },
    }),
  ]);

  return {
    ...toRow(row),
    issued: fromBig(issued._sum.amount) / 1000,
    sold: Math.abs(fromBig(sold._sum.amount)) / 1000,
    mustChangePassword: row.mustChangePassword,
    suspendedReason: row.suspendedReason,
    activeSessions: sessions,
  };
}
