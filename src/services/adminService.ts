import "server-only";


import { prisma } from "@/server/db";
import { requirePermission } from "@/server/auth/guard";
import { managedPlayerWhere } from "@/server/auth/scope";
import { listAdminTransactions, type TransactionQueryInput } from "@/server/repositories/transactionRepository";
import { clampPage, cleanSearch } from "@/server/repositories/filters";
import type { AdminTransaction, Paginated, TransactionKind, TransactionStatus } from "@/types";
import { loadLimitsFor } from "./responsibleService";
import type { ResponsibleGamblingCase } from "./types";

/**
 * Operator reads that do not belong to a more specific service. Each function
 * starts with its own permission check; nothing here trusts the page that
 * called it.
 */

export interface AdminTransactionQuery {
  search?: string;
  kind?: TransactionKind | TransactionKind[];
  status?: TransactionStatus | TransactionStatus[];
  userId?: string;
  from?: Date;
  to?: Date;
  minAmount?: number;
  maxAmount?: number;
  page?: number;
  pageSize?: number;
  sort?: string;
  direction?: "asc" | "desc";
}

/** Platform-wide ledger, or one player's when `userId` is given. */
export async function getAdminTransactions(
  query: AdminTransactionQuery = {},
): Promise<Paginated<AdminTransaction>> {
  const actor = await requirePermission("transactions.read");

  const input: TransactionQueryInput = {
    ...query,
    // A manager sees their own wallet's movements and their players' — nobody else's.
    userScope:
      actor.role === "manager"
        ? { OR: [{ id: actor.id }, managedPlayerWhere(actor)] }
        : undefined,
    kinds: query.kind === undefined ? undefined : Array.isArray(query.kind) ? query.kind : [query.kind],
    statuses:
      query.status === undefined ? undefined : Array.isArray(query.status) ? query.status : [query.status],
  };
  return listAdminTransactions(input);
}

/* ------------------------------------------------- responsible gambling queue */

const SEVERITY_RANK: Record<ResponsibleGamblingCase["severity"], number> = {
  low: 0,
  medium: 1,
  high: 2,
};

/**
 * The welfare queue, derived from live data: active exclusions, limit increases
 * still inside their cooling-off window, and limits a player has spent through.
 * A licensed operator would also feed it from behavioural monitoring, which
 * this platform does not have.
 */
export async function getResponsibleGamblingCases(query: {
  search?: string;
  page?: number;
  pageSize?: number;
}): Promise<Paginated<ResponsibleGamblingCase>> {
  await requirePermission("rg.read");
  const now = new Date();
  const cases: ResponsibleGamblingCase[] = [];

  const exclusions = await prisma.selfExclusion.findMany({
    where: { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
    include: { user: { select: { username: true } } },
    orderBy: { startedAt: "desc" },
    take: 200,
  });
  for (const exclusion of exclusions) {
    const coolingOff = exclusion.kind === "COOLING_OFF";
    cases.push({
      id: `case-${exclusion.id}`,
      userId: exclusion.userId,
      userName: exclusion.user.username,
      kind: coolingOff ? "admin.rgCase.kind.coolingOff" : "admin.rgCase.kind.selfExclusion",
      detail:
        exclusion.endsAt === null
          ? "admin.rgCase.detail.indefinite"
          : coolingOff
            ? "admin.rgCase.detail.coolingOffActive"
            : "admin.rgCase.detail.selfExclusionActive",
      createdAt: exclusion.startedAt.toISOString(),
      severity: coolingOff ? "medium" : "high",
    });
  }

  // Players with a limit row — checked for pending increases and spent limits.
  const withLimits = await prisma.responsibleGamblingLimit.findMany({
    where: { active: true },
    distinct: ["userId"],
    select: { userId: true, user: { select: { username: true } } },
    take: 200,
  });
  for (const { userId, user } of withLimits) {
    for (const limit of await loadLimitsFor(userId)) {
      if (limit.pendingValue !== null) {
        cases.push({
          id: `case-${limit.id}-pending`,
          userId,
          userName: user.username,
          kind: "admin.rgCase.kind.limitIncrease",
          detail: "admin.rgCase.detail.limitIncreasePending",
          createdAt: limit.pendingEffectiveFrom ?? limit.effectiveFrom,
          severity: "low",
        });
      }
      // Hitting a self-imposed ceiling is the early signal a welfare team wants.
      if (limit.kind !== "single_bet" && limit.used >= limit.value) {
        cases.push({
          id: `case-${limit.id}-reached`,
          userId,
          userName: user.username,
          kind: "admin.rgCase.kind.limitReached",
          detail: "admin.rgCase.detail.limitReached",
          createdAt: limit.effectiveFrom,
          severity: "medium",
        });
      }
    }
  }

  const search = cleanSearch(query.search)?.toLowerCase();
  const matched = search ? cases.filter((entry) => entry.userName.toLowerCase().includes(search)) : cases;
  matched.sort(
    (a, b) =>
      SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || b.createdAt.localeCompare(a.createdAt),
  );

  const { page, pageSize, skip, take } = clampPage(query.page, query.pageSize);
  return {
    items: matched.slice(skip, skip + take),
    page,
    pageSize,
    total: matched.length,
    totalPages: Math.max(1, Math.ceil(matched.length / pageSize)),
  };
}

