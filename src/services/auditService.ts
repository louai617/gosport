import "server-only";

import type { Prisma } from "@prisma/client";

import { prisma } from "@/server/db";
import { requirePermission } from "@/server/auth/guard";
import { roleFromDb } from "@/server/auth/roles";
import { clampPage, cleanSearch, containsCI } from "@/server/repositories/filters";
import type { Paginated } from "@/types";
import type { UserRole } from "@/types/user";

/**
 * Read access to the audit trail. There is deliberately no write, update or
 * delete function in this module — and none anywhere else that an administrator
 * can reach: the table's own triggers refuse them.
 */

export interface AuditLogQuery {
  /** Username (partial) or id of whoever performed the action. */
  actor?: string;
  /** Username (partial) or id of the player concerned. */
  player?: string;
  /** Exact action, or a prefix ending in ".", e.g. "admin.wallet.". */
  action?: string;
  transactionId?: string;
  ip?: string;
  severity?: "info" | "warning" | "critical";
  outcome?: "success" | "failure" | "blocked";
  from?: Date;
  to?: Date;
  page?: number;
  pageSize?: number;
}

export interface AuditLogRow {
  id: string;
  createdAt: string;
  action: string;
  severity: "info" | "warning" | "critical";
  outcome: "success" | "failure" | "blocked";
  description: string;
  actorId: string | null;
  actorUsername: string | null;
  actorRole: UserRole | null;
  targetUserId: string | null;
  targetUsername: string | null;
  transactionId: string | null;
  ip: string | null;
  userAgent: string | null;
  requestId: string | null;
  metadata: unknown;
}

function whereFor(query: AuditLogQuery): Prisma.AuditLogWhereInput {
  const and: Prisma.AuditLogWhereInput[] = [];

  const actor = cleanSearch(query.actor);
  if (actor) {
    and.push({ OR: [{ actorId: actor }, { actor: { username: containsCI(actor) } }] });
  }
  const player = cleanSearch(query.player);
  if (player) {
    and.push({ OR: [{ targetUserId: player }, { target: { username: containsCI(player) } }] });
  }
  const action = cleanSearch(query.action, 80);
  if (action) {
    and.push(action.endsWith(".") ? { action: { startsWith: action } } : { action });
  }
  const transactionId = cleanSearch(query.transactionId);
  if (transactionId) and.push({ transactionId });
  const ip = cleanSearch(query.ip, 45);
  if (ip) and.push({ ip: containsCI(ip) });
  if (query.severity) and.push({ severity: query.severity.toUpperCase() as "INFO" });
  if (query.outcome) and.push({ outcome: query.outcome.toUpperCase() as "SUCCESS" });
  if (query.from || query.to) {
    and.push({
      createdAt: { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lte: query.to } : {}) },
    });
  }
  return and.length ? { AND: and } : {};
}

export async function listAuditLogs(query: AuditLogQuery = {}): Promise<Paginated<AuditLogRow>> {
  await requirePermission("audit.read");

  const where = whereFor(query);
  const { page, pageSize, skip, take } = clampPage(query.page, query.pageSize);

  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: {
        actor: { select: { username: true } },
        target: { select: { username: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip,
      take,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return {
    items: rows.map((row) => ({
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      action: row.action,
      severity: row.severity.toLowerCase() as AuditLogRow["severity"],
      outcome: row.outcome.toLowerCase() as AuditLogRow["outcome"],
      description: row.description,
      actorId: row.actorId,
      actorUsername: row.actor?.username ?? null,
      actorRole: row.actorRole ? roleFromDb(row.actorRole) : null,
      targetUserId: row.targetUserId,
      targetUsername: row.target?.username ?? null,
      transactionId: row.transactionId,
      ip: row.ip,
      userAgent: row.userAgent,
      requestId: row.requestId,
      metadata: row.metadata,
    })),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/** The distinct actions on record, for the filter dropdown. */
export async function listAuditActions(): Promise<string[]> {
  await requirePermission("audit.read");
  const rows = await prisma.auditLog.findMany({
    distinct: ["action"],
    select: { action: true },
    orderBy: { action: "asc" },
    take: 200,
  });
  return rows.map((row) => row.action);
}

/** Operators (superadmin and managers), for the "Admin" filter. */
export async function listAuditActors(): Promise<Array<{ id: string; username: string }>> {
  await requirePermission("audit.read");
  return prisma.user.findMany({
    where: { role: { in: ["SUPERADMIN", "MANAGER"] } },
    select: { id: true, username: true },
    orderBy: { username: "asc" },
    take: 100,
  });
}
