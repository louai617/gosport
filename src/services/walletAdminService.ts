import "server-only";

import type { Prisma, TransactionType } from "@prisma/client";

import { type AdjustmentInput } from "@/lib/adminValidation";
import { fromBig, toBig, toMillimes } from "@/lib/money";
import { isUniqueViolation, prisma, transact } from "@/server/db";
import { requirePermission } from "@/server/auth/guard";
import { notifyAdmins, notifyUser } from "@/server/notifications/notify";
import { audit } from "@/server/security/audit";
import { describeEntry } from "@/server/wallet/descriptions";
import { appendLedgerEntry, LedgerError, reconcileWallet } from "@/server/wallet/ledger";
import { getSetting } from "@/server/settings/settingsService";
import type { SessionUser } from "@/types/user";
import { assertDepositAllowed } from "./responsibleService";
import { walletSnapshot } from "./paymentService";
import type { AuthError } from "@/server/auth/guard";

/**
 * Operator wallet operations: manual credits and debits, the four-eyes approval
 * queue, and the withdrawal queue.
 *
 * There is no way to change a balance from here except by appending a ledger
 * entry through `appendLedgerEntry`. Each operation writes its audit record in
 * the same database transaction, so a manual balance change that is not on the
 * record cannot exist.
 */

export interface AdjustmentResult {
  ok: boolean;
  errorKey?: string;
  /** The entry was queued for a second administrator rather than applied. */
  pendingApproval?: boolean;
  transactionId?: string;
  reference?: string;
  balanceBefore?: number;
  balanceAfter?: number;
}

const CREDIT_TYPES: ReadonlySet<TransactionType> = new Set([
  "ADMIN_CREDIT",
  "DEPOSIT",
  "BONUS",
  "REFUND",
]);

/** Signed millimes for a request. */
function signedAmount(input: Pick<AdjustmentInput, "type" | "direction" | "amount">): number {
  const magnitude = toMillimes(input.amount);
  if (input.type === "ADJUSTMENT") return input.direction === "debit" ? -magnitude : magnitude;
  return CREDIT_TYPES.has(input.type) ? magnitude : -magnitude;
}

async function loadPlayer(playerId: string) {
  const player = await prisma.user.findUnique({
    where: { id: playerId },
    select: { id: true, username: true, role: true, status: true },
  });
  if (!player || player.role !== "PLAYER") return null;
  return player;
}

/** The single code path that applies a manual ledger entry. */
async function applyManualEntry(
  tx: Prisma.TransactionClient,
  actor: SessionUser,
  playerId: string,
  type: TransactionType,
  signed: number,
  details: { reason: string; reference?: string; requestId?: string; idempotencyKey?: string },
) {
  const description = describeEntry(type);
  const { entry, replayed } = await appendLedgerEntry(tx, {
    userId: playerId,
    type,
    amount: signed,
    description: description.description,
    idempotencyKey: details.idempotencyKey ? `adj:${details.idempotencyKey}` : null,
    createdById: actor.id,
    metadata: {
      descriptionKey: description.descriptionKey,
      reason: details.reason,
      externalReference: details.reference,
      adjustmentRequestId: details.requestId,
    },
  });
  return { entry, replayed };
}

export async function adjustWallet(input: AdjustmentInput): Promise<AdjustmentResult> {
  const actor = await requirePermission("wallet.adjust");

  const player = await loadPlayer(input.playerId);
  if (!player) return { ok: false, errorKey: "admin.players.error.notFound" };
  if (player.status === "CLOSED" || player.status === "PENDING") {
    return { ok: false, errorKey: "admin.wallet.error.accountNotFundable" };
  }

  const [allowedTypes, maxAdjustment, minTx, maxTx, threshold] = await Promise.all([
    getSetting("wallet.allowedAdjustmentTypes"),
    getSetting("wallet.maxAdjustmentAmount"),
    getSetting("wallet.minTransactionAmount"),
    getSetting("wallet.maxTransactionAmount"),
    getSetting("wallet.adjustmentApprovalThreshold"),
  ]);

  if (!allowedTypes.includes(input.type)) {
    return { ok: false, errorKey: "admin.wallet.error.typeNotAllowed" };
  }
  if (input.amount > maxAdjustment) return { ok: false, errorKey: "admin.wallet.error.overMax" };
  if (input.type === "DEPOSIT" || input.type === "WITHDRAWAL") {
    if (input.amount < minTx) return { ok: false, errorKey: "wallet.validation.amountTooLow" };
    if (input.amount > maxTx) return { ok: false, errorKey: "wallet.validation.amountTooHigh" };
  }

  const signed = signedAmount(input);

  // Four-eyes: a large manual movement is requested here and applied by someone else.
  if (threshold > 0 && input.amount >= threshold) {
    {
      const created = await transact(async (tx) => {
        const request = await tx.adjustmentRequest.create({
          data: {
            userId: player.id,
            type: input.type,
            amount: toBig(signed),
            reason: input.reason,
            reference: input.reference ?? null,
            requestedById: actor.id,
          },
        });
        await audit({
          tx,
          action: "admin.wallet.adjustment_requested",
          actor,
          targetUserId: player.id,
          targetType: "adjustment_request",
          targetId: request.id,
          description: `Requested ${input.type} of ${input.amount.toFixed(3)} for ${player.username} (awaiting approval)`,
          metadata: { type: input.type, amountMillimes: signed, reason: input.reason },
        });
        await notifyAdmins(
          {
            tx,
            kind: "approval_request",
            titleKey: "notify.approvalRequest.title",
            bodyKey: "notify.approvalRequest.body",
            params: { username: player.username, amount: input.amount.toFixed(2) },
            href: "/admin/wallet",
          },
          { exceptUserId: actor.id },
        );
        return request;
      });
      return { ok: true, pendingApproval: true, transactionId: created.id };
    }
  }

  try {
    if (input.type === "DEPOSIT") await assertDepositAllowed(player.id, toMillimes(input.amount));
  } catch (error) {
    return { ok: false, errorKey: (error as AuthError).messageKey ?? "common.error.unexpected" };
  }

  try {
    const result = await transact(async (tx) => {
      const { entry, replayed } = await applyManualEntry(tx, actor, player.id, input.type, signed, {
        reason: input.reason,
        reference: input.reference,
        idempotencyKey: input.idempotencyKey,
      });

      if (!replayed) {
        await audit({
          tx,
          action: "admin.wallet.adjusted",
          actor,
          targetUserId: player.id,
          targetType: "transaction",
          targetId: entry.id,
          transactionId: entry.id,
          description: `${input.type} ${signed > 0 ? "+" : "−"}${input.amount.toFixed(3)} for ${player.username}: ${input.reason}`,
          metadata: {
            type: input.type,
            amountMillimes: signed,
            balanceBefore: entry.balanceBefore,
            balanceAfter: entry.balanceAfter,
            reason: input.reason,
            reference: input.reference ?? null,
            transactionReference: entry.reference,
          },
        });
        await notifyUser(player.id, {
          tx,
          kind: "transaction",
          titleKey: "notify.balanceUpdated.title",
          bodyKey: signed > 0 ? "notify.balanceUpdated.credit" : "notify.balanceUpdated.debit",
          params: { amount: input.amount.toFixed(2) },
          href: "/account/transactions",
        });
      }
      return { entry, replayed };
    });

    await alertIfLarge(player.username, input.amount, result.entry.id);

    return {
      ok: true,
      transactionId: result.entry.id,
      reference: result.entry.reference,
      balanceBefore: result.entry.balanceBefore / 1000,
      balanceAfter: result.entry.balanceAfter / 1000,
    };
  } catch (error) {
    if (error instanceof LedgerError) return { ok: false, errorKey: error.messageKey };
    if (input.idempotencyKey && isUniqueViolation(error, "idempotencyKey")) {
      return { ok: false, errorKey: "admin.wallet.error.duplicate" };
    }
    throw error;
  }
}

async function alertIfLarge(username: string, amount: number, transactionId: string): Promise<void> {
  const limit = await getSetting("wallet.largeTransactionAlert");
  if (limit > 0 && amount >= limit) {
    await notifyAdmins({
      kind: "transaction",
      titleKey: "notify.largeTransaction.title",
      bodyKey: "notify.largeTransaction.body",
      params: { username, amount: amount.toFixed(2) },
      href: `/admin/transactions?search=${transactionId}`,
    });
  }
}

/* ------------------------------------------------------------ approval queue */

export interface AdjustmentRequestRow {
  id: string;
  username: string;
  userId: string;
  type: string;
  amount: number;
  reason: string;
  reference: string | null;
  status: "pending" | "approved" | "rejected";
  requestedBy: string;
  decidedBy: string | null;
  createdAt: string;
  decidedAt: string | null;
  decisionNote: string | null;
}

export async function listAdjustmentRequests(
  status?: "pending" | "approved" | "rejected",
): Promise<AdjustmentRequestRow[]> {
  await requirePermission("wallet.read");
  const rows = await prisma.adjustmentRequest.findMany({
    where: status ? { status: status.toUpperCase() as "PENDING" } : {},
    include: { user: { select: { username: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const ids = [...new Set(rows.flatMap((row) => [row.requestedById, row.decidedById]).filter((id): id is string => !!id))];
  const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, username: true } });
  const names = new Map(users.map((user) => [user.id, user.username]));

  return rows.map((row) => ({
    id: row.id,
    userId: row.userId,
    username: row.user.username,
    type: row.type,
    amount: fromBig(row.amount) / 1000,
    reason: row.reason,
    reference: row.reference,
    status: row.status.toLowerCase() as AdjustmentRequestRow["status"],
    requestedBy: names.get(row.requestedById) ?? "—",
    decidedBy: row.decidedById ? (names.get(row.decidedById) ?? "—") : null,
    createdAt: row.createdAt.toISOString(),
    decidedAt: row.decidedAt?.toISOString() ?? null,
    decisionNote: row.decisionNote,
  }));
}

export async function decideAdjustment(
  id: string,
  decision: "approve" | "reject",
  note?: string,
): Promise<AdjustmentResult> {
  const actor = await requirePermission("wallet.adjust.approve");

  const request = await prisma.adjustmentRequest.findUnique({
    where: { id },
    include: { user: { select: { username: true } } },
  });
  if (!request) return { ok: false, errorKey: "admin.wallet.error.requestNotFound" };
  if (request.status !== "PENDING") return { ok: false, errorKey: "admin.wallet.error.alreadyDecided" };
  // The person who asked cannot be the person who approves.
  if (request.requestedById === actor.id) return { ok: false, errorKey: "admin.wallet.error.selfApproval" };

  try {
    const result = await transact(async (tx) => {
      const claimed = await tx.adjustmentRequest.updateMany({
        where: { id, status: "PENDING" },
        data: {
          status: decision === "approve" ? "APPROVED" : "REJECTED",
          decidedById: actor.id,
          decidedAt: new Date(),
          decisionNote: note ?? null,
        },
      });
      if (claimed.count !== 1) return null;

      if (decision === "reject") {
        await audit({
          tx,
          action: "admin.wallet.adjustment_rejected",
          actor,
          targetUserId: request.userId,
          targetType: "adjustment_request",
          targetId: id,
          description: `Rejected ${request.type} request for ${request.user.username}`,
          metadata: { note: note ?? null },
        });
        return { entry: null };
      }

      const { entry } = await applyManualEntry(
        tx,
        actor,
        request.userId,
        request.type,
        fromBig(request.amount),
        {
          reason: request.reason,
          reference: request.reference ?? undefined,
          requestId: request.id,
          idempotencyKey: `request:${request.id}`,
        },
      );
      await tx.adjustmentRequest.update({ where: { id }, data: { transactionId: entry.id } });
      await audit({
        tx,
        action: "admin.wallet.adjustment_approved",
        actor,
        targetUserId: request.userId,
        targetType: "transaction",
        targetId: entry.id,
        transactionId: entry.id,
        description: `Approved ${request.type} for ${request.user.username}`,
        metadata: {
          requestedById: request.requestedById,
          amountMillimes: fromBig(request.amount),
          balanceBefore: entry.balanceBefore,
          balanceAfter: entry.balanceAfter,
          reason: request.reason,
        },
      });
      await notifyUser(request.userId, {
        tx,
        kind: "transaction",
        titleKey: "notify.balanceUpdated.title",
        bodyKey:
          fromBig(request.amount) > 0
            ? "notify.balanceUpdated.credit"
            : "notify.balanceUpdated.debit",
        params: { amount: (Math.abs(fromBig(request.amount)) / 1000).toFixed(2) },
        href: "/account/transactions",
      });
      return { entry };
    });

    if (!result) return { ok: false, errorKey: "admin.wallet.error.alreadyDecided" };
    return {
      ok: true,
      transactionId: result.entry?.id,
      reference: result.entry?.reference,
      balanceAfter: result.entry ? result.entry.balanceAfter / 1000 : undefined,
    };
  } catch (error) {
    // The debit could not be funded: the claim rolled back with the transaction,
    // so the request is still pending and can be rejected instead.
    if (error instanceof LedgerError) return { ok: false, errorKey: error.messageKey };
    throw error;
  }
}

/* --------------------------------------------------------- withdrawal queue */

export async function processWithdrawal(
  transactionId: string,
  decision: "approve" | "reject",
  note?: string,
): Promise<{ ok: boolean; errorKey?: string }> {
  const actor = await requirePermission("withdrawals.process");

  const row = await prisma.transaction.findUnique({
    where: { id: transactionId },
    include: { user: { select: { username: true } } },
  });
  if (!row || row.type !== "WITHDRAWAL") return { ok: false, errorKey: "admin.withdrawals.error.notFound" };
  if (row.status !== "PENDING") return { ok: false, errorKey: "admin.withdrawals.error.alreadyProcessed" };

  const merged = {
    ...((row.metadata && typeof row.metadata === "object" ? row.metadata : {}) as Record<string, unknown>),
    decision: decision === "approve" ? "approved" : "rejected",
    decidedBy: actor.id,
    decisionNote: note ?? null,
  };

  const done = await transact(async (tx) => {
    // One conditional update decides who processes it: a second click, or a
    // second administrator, matches zero rows.
    const claimed = await tx.transaction.updateMany({
      where: { id: transactionId, status: "PENDING", type: "WITHDRAWAL" },
      data: {
        status: decision === "approve" ? "COMPLETED" : "REVERSED",
        settledAt: new Date(),
        metadata: merged as Prisma.InputJsonValue,
      },
    });
    if (claimed.count !== 1) return false;

    if (decision === "approve") {
      await audit({
        tx,
        action: "admin.withdrawal.approved",
        actor,
        targetUserId: row.userId,
        targetType: "transaction",
        targetId: row.id,
        transactionId: row.id,
        description: `Approved withdrawal ${row.reference} for ${row.user.username}`,
        metadata: { amountMillimes: fromBig(row.amount), note: note ?? null },
      });
    } else {
      const description = describeEntry("REFUND");
      await appendLedgerEntry(tx, {
        userId: row.userId,
        type: "REFUND",
        amount: -fromBig(row.amount),
        description: description.description,
        idempotencyKey: `withdraw-reject:${row.id}`,
        createdById: actor.id,
        relatedId: row.id,
        metadata: {
          descriptionKey: "wallet.tx.withdrawalReturned",
          relatedReference: row.reference,
        },
      });
      await audit({
        tx,
        action: "admin.withdrawal.rejected",
        actor,
        targetUserId: row.userId,
        targetType: "transaction",
        targetId: row.id,
        transactionId: row.id,
        description: `Rejected withdrawal ${row.reference} for ${row.user.username}; funds returned`,
        metadata: { amountMillimes: fromBig(row.amount), note: note ?? null },
      });
    }

    await notifyUser(row.userId, {
      tx,
      kind: "transaction",
      titleKey: "notify.withdrawalDecision.title",
      bodyKey:
        decision === "approve"
          ? "notify.withdrawalDecision.approved"
          : "notify.withdrawalDecision.rejected",
      params: { amount: (Math.abs(fromBig(row.amount)) / 1000).toFixed(2) },
      href: "/account/transactions",
    });
    return true;
  });

  return done ? { ok: true } : { ok: false, errorKey: "admin.withdrawals.error.alreadyProcessed" };
}

/* ----------------------------------------------------------------- per player */

export interface PlayerWalletSummary {
  balance: number;
  reserved: number;
  deposits: number;
  withdrawals: number;
  bets: number;
  wins: number;
  refunds: number;
  bonuses: number;
  /** Net of ADMIN_CREDIT, ADMIN_DEBIT and ADJUSTMENT. */
  manualAdjustments: number;
  integrity: { consistent: boolean; ledgerSum: number; balance: number; entries: number };
}

export async function getPlayerWalletSummary(playerId: string): Promise<PlayerWalletSummary> {
  await requirePermission("wallet.read");

  const sums = await prisma.transaction.groupBy({
    by: ["type"],
    // A REFUND with a `relatedId` returns a rejected withdrawal — a reversal, not a
    // refund the player was given, so it stays out. (A sold deposit also carries a
    // `relatedId`, and is a real deposit.)
    where: {
      userId: playerId,
      status: { in: ["COMPLETED", "PENDING"] },
      NOT: { type: "REFUND", relatedId: { not: null } },
    },
    _sum: { amount: true },
  });
  const sum = (...types: TransactionType[]) =>
    sums.filter((row) => types.includes(row.type)).reduce((total, row) => total + fromBig(row._sum.amount), 0) / 1000;

  const snapshot = await walletSnapshot(playerId);
  const reconcile = await reconcileWallet(prisma, playerId);

  return {
    balance: snapshot.balance,
    reserved: snapshot.reserved,
    deposits: sum("DEPOSIT"),
    withdrawals: Math.abs(sum("WITHDRAWAL")),
    bets: Math.abs(sum("BET")),
    wins: sum("WIN"),
    refunds: sum("REFUND"),
    bonuses: sum("BONUS"),
    manualAdjustments: sum("ADMIN_CREDIT", "ADMIN_DEBIT", "ADJUSTMENT"),
    integrity: {
      consistent: reconcile.consistent,
      ledgerSum: reconcile.ledgerSum / 1000,
      balance: reconcile.balance / 1000,
      entries: reconcile.entries,
    },
  };
}
