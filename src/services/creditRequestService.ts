import "server-only";

import type { CreditRequestInput } from "@/lib/adminValidation";
import { fromBig, toBig, toMillimes } from "@/lib/money";
import { prisma, transact } from "@/server/db";
import { AuthError, requirePermission, requireUser } from "@/server/auth/guard";
import { managedPlayerWhere } from "@/server/auth/scope";
import { notifyUser } from "@/server/notifications/notify";
import { audit } from "@/server/security/audit";
import { LedgerError } from "@/server/wallet/ledger";
import { amountError, sellCreditTx } from "./creditService";

/**
 * Credit requests: a player asking their manager for credit.
 *
 * Asking moves nothing. The request is addressed to the manager who created the
 * player; they approve it — which is exactly a credit sale out of their own
 * balance, in one transaction with the same guards (cannot sell more than they
 * hold, the player's deposit limits apply) — or reject it. The player can cancel
 * while it is pending. A player with no manager (created by the superadmin) has
 * nobody to ask.
 */

const MAX_PENDING = 3;

export interface CreditRequestRow {
  id: string;
  /** TND. */
  amount: number;
  note: string | null;
  status: "pending" | "approved" | "rejected" | "cancelled";
  createdAt: string;
  decidedAt: string | null;
  decisionNote: string | null;
  /** The other party: the manager (player's view) or the player (manager's view). */
  counterpart: string;
  counterpartId: string;
}

export interface CreditRequestResult {
  ok: boolean;
  errorKey?: string;
  fieldErrors?: Record<string, string>;
  id?: string;
}

type Row = Awaited<ReturnType<typeof prisma.creditRequest.findMany<{ include: { player: { select: { username: true } }; manager: { select: { username: true } } } }>>>[number];

function toRow(row: Row, view: "player" | "manager"): CreditRequestRow {
  return {
    id: row.id,
    amount: fromBig(row.amount) / 1000,
    note: row.note,
    status: row.status.toLowerCase() as CreditRequestRow["status"],
    createdAt: row.createdAt.toISOString(),
    decidedAt: row.decidedAt?.toISOString() ?? null,
    decisionNote: row.decisionNote,
    counterpart: view === "player" ? row.manager.username : row.player.username,
    counterpartId: view === "player" ? row.managerId : row.playerId,
  };
}

const include = { player: { select: { username: true } }, manager: { select: { username: true } } } as const;

/* ------------------------------------------------------------------ player */

/** Who a player's requests go to, or null when they have no (active) manager. */
export async function getOwnManager(): Promise<{ id: string; username: string; displayName: string } | null> {
  const user = await requireUser();
  if (user.role !== "player") return null;
  const row = await prisma.user.findUnique({
    where: { id: user.id },
    select: { createdBy: { select: { id: true, role: true, status: true, username: true, profile: { select: { displayName: true } } } } },
  });
  const manager = row?.createdBy;
  if (!manager || manager.role !== "MANAGER" || manager.status !== "ACTIVE") return null;
  return { id: manager.id, username: manager.username, displayName: manager.profile?.displayName ?? manager.username };
}

export async function requestCredit(input: CreditRequestInput): Promise<CreditRequestResult> {
  const user = await requireUser();
  if (user.role !== "player") throw new AuthError("forbidden", "auth.error.insufficientRole");
  if (user.status === "self_excluded") return { ok: false, errorKey: "responsible.error.selfExcluded" };
  if (user.status !== "active") return { ok: false, errorKey: "credit.error.accountNotActive" };

  const manager = await getOwnManager();
  if (!manager) return { ok: false, errorKey: "credit.request.noManager" };

  const problem = await amountError(input.amount);
  if (problem) return { ok: false, errorKey: problem, fieldErrors: { amount: problem } };

  const pending = await prisma.creditRequest.count({ where: { playerId: user.id, status: "PENDING" } });
  if (pending >= MAX_PENDING) return { ok: false, errorKey: "credit.request.tooMany" };

  const created = await transact(async (tx) => {
    const request = await tx.creditRequest.create({
      data: {
        playerId: user.id,
        managerId: manager.id,
        amount: toBig(toMillimes(input.amount)),
        note: input.note ?? null,
      },
    });
    await audit({
      tx,
      action: "wallet.credit_requested",
      actor: user,
      targetUserId: manager.id,
      targetType: "credit_request",
      targetId: request.id,
      description: `${user.username} asked ${manager.username} for ${input.amount.toFixed(2)} TND of credit`,
      metadata: { amountMillimes: toMillimes(input.amount) },
    });
    await notifyUser(manager.id, {
      tx,
      kind: "credit_request",
      titleKey: "notify.creditRequest.title",
      bodyKey: "notify.creditRequest.body",
      params: { username: user.username, amount: input.amount.toFixed(2) },
      href: "/admin/credit-requests",
    });
    return request;
  });
  return { ok: true, id: created.id };
}

export async function listOwnCreditRequests(): Promise<CreditRequestRow[]> {
  const user = await requireUser();
  const rows = await prisma.creditRequest.findMany({
    where: { playerId: user.id },
    include,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 15,
  });
  return rows.map((row) => toRow(row, "player"));
}

export async function cancelCreditRequest(id: string): Promise<CreditRequestResult> {
  const user = await requireUser();
  // One conditional update: only the owner's still-pending request is cancelled.
  const done = await transact(async (tx) => {
    const claimed = await tx.creditRequest.updateMany({
      where: { id, playerId: user.id, status: "PENDING" },
      data: { status: "CANCELLED", decidedAt: new Date() },
    });
    if (claimed.count !== 1) return false;
    await audit({
      tx,
      action: "wallet.credit_request_cancelled",
      actor: user,
      targetType: "credit_request",
      targetId: id,
      description: `${user.username} cancelled a credit request`,
    });
    return true;
  });
  return done ? { ok: true } : { ok: false, errorKey: "credit.request.notPending" };
}

/* ----------------------------------------------------------------- manager */

export async function listCreditRequests(): Promise<{ pending: CreditRequestRow[]; recent: CreditRequestRow[] }> {
  const actor = await requirePermission("credit.distribute");
  const [pending, recent] = await Promise.all([
    prisma.creditRequest.findMany({
      where: { managerId: actor.id, status: "PENDING" },
      include,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 100,
    }),
    prisma.creditRequest.findMany({
      where: { managerId: actor.id, status: { not: "PENDING" } },
      include,
      orderBy: [{ decidedAt: "desc" }, { id: "desc" }],
      take: 15,
    }),
  ]);
  return { pending: pending.map((row) => toRow(row, "manager")), recent: recent.map((row) => toRow(row, "manager")) };
}

export async function decideCreditRequest(
  id: string,
  decision: "approve" | "reject",
  note?: string,
): Promise<CreditRequestResult> {
  const actor = await requirePermission("credit.distribute");
  if (actor.role !== "manager") throw new AuthError("forbidden", "auth.error.insufficientRole");

  // A manager reaches only requests addressed to them, from players that are still theirs.
  const request = await prisma.creditRequest.findFirst({
    where: { id, managerId: actor.id },
    include: { player: { select: { id: true, username: true, status: true } } },
  });
  if (!request) return { ok: false, errorKey: "credit.request.notFound" };
  const stillTheirs = await prisma.user.findFirst({ where: { id: request.playerId, ...managedPlayerWhere(actor) }, select: { id: true } });
  if (!stillTheirs) return { ok: false, errorKey: "credit.request.notFound" };
  if (request.status !== "PENDING") return { ok: false, errorKey: "credit.request.notPending" };

  const amount = fromBig(request.amount) / 1000;

  try {
    const done = await transact(async (tx) => {
      // The claim decides who processes it: a second click matches zero rows.
      const claimed = await tx.creditRequest.updateMany({
        where: { id, managerId: actor.id, status: "PENDING" },
        data: {
          status: decision === "approve" ? "APPROVED" : "REJECTED",
          decidedAt: new Date(),
          decidedById: actor.id,
          decisionNote: note ?? null,
        },
      });
      if (claimed.count !== 1) return false;

      if (decision === "approve") {
        if (request.player.status !== "ACTIVE") throw new AuthError("forbidden", "credit.error.accountNotActive");
        // Exactly a credit sale: the manager's guarded debit and the player's deposit limits apply,
        // and any failure rolls the claim back with it.
        const sale = await sellCreditTx(tx, actor, request.player, amount, { key: `request-${id}` });
        if (sale.inEntry) {
          await tx.creditRequest.update({ where: { id }, data: { transactionId: sale.inEntry.id } });
        }
      } else {
        await notifyUser(request.playerId, {
          tx,
          kind: "credit",
          titleKey: "notify.creditRequestRejected.title",
          bodyKey: "notify.creditRequestRejected.body",
          params: { amount: amount.toFixed(2) },
          href: "/wallet/deposit",
        });
      }

      await audit({
        tx,
        action: "admin.credit.request_decided",
        actor,
        targetUserId: request.playerId,
        targetType: "credit_request",
        targetId: id,
        description: `${decision === "approve" ? "Approved" : "Rejected"} ${request.player.username}'s request for ${amount.toFixed(2)} TND`,
        metadata: { decision, amountMillimes: toMillimes(amount), note: note ?? null },
      });
      return true;
    });
    return done ? { ok: true } : { ok: false, errorKey: "credit.request.notPending" };
  } catch (error) {
    if (error instanceof LedgerError) {
      return {
        ok: false,
        errorKey: error.code === "insufficient_funds" ? "credit.error.insufficientBalance" : error.messageKey,
      };
    }
    if (error instanceof AuthError) return { ok: false, errorKey: error.messageKey };
    throw error;
  }
}

/** How many requests are waiting for the signed-in manager. */
export async function countPendingCreditRequests(): Promise<number> {
  const actor = await requirePermission("credit.distribute");
  return prisma.creditRequest.count({ where: { managerId: actor.id, status: "PENDING" } });
}
