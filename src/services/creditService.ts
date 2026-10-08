import "server-only";

import { randomBytes } from "node:crypto";

import { fromBig, toMillimes } from "@/lib/money";
import type { CreditInput } from "@/lib/adminValidation";
import { prisma, transact, type Tx } from "@/server/db";
import { AuthError, requirePermission } from "@/server/auth/guard";
import { managedManagerWhere, managedPlayerWhere } from "@/server/auth/scope";
import { notifyUser } from "@/server/notifications/notify";
import { audit } from "@/server/security/audit";
import { getSetting } from "@/server/settings/settingsService";
import { LedgerError, appendLedgerEntry } from "@/server/wallet/ledger";
import type { SessionUser } from "@/types/user";
import { assertDepositAllowed } from "./responsibleService";

/**
 * Credit moves **down a chain of ownership**, and only down it:
 *
 *   superadmin ──issues──▶ manager ──sells──▶ player
 *
 * - The superadmin *issues* credit: a new `ADMIN_CREDIT` entry on the manager's
 *   wallet. There is no balance to draw on — the superadmin is the source — so
 *   this is the most sensitive write in the product and is audited `critical`.
 * - A manager *sells* credit out of their own balance: one `CREDIT_TRANSFER`
 *   debit on the manager and one `DEPOSIT` credit on the player, in a single
 *   database transaction. The debit is the guarded atomic update, so a manager
 *   cannot sell credit they do not hold, however many requests race.
 *
 * Both authorise inside the function, and the recipient is looked up *through
 * the actor's scope*: a manager can only sell to a player they created.
 */

export interface CreditResult {
  ok: boolean;
  errorKey?: string;
  fieldErrors?: Record<string, string>;
  /** Reference of the entry on the recipient's side. */
  reference?: string;
  /** The actor's own balance after the movement (TND), when it is theirs to see. */
  senderBalance?: number;
  recipientBalance?: number;
}

function newKey(): string {
  return randomBytes(12).toString("hex");
}

/** Amount limits shared by both directions. */
async function amountError(amount: number, tx: Tx | typeof prisma = prisma): Promise<string | null> {
  const [min, max] = await Promise.all([
    getSetting("wallet.minTransactionAmount", tx),
    getSetting("wallet.maxTransactionAmount", tx),
  ]);
  if (amount < min) return "wallet.validation.amountTooLow";
  if (amount > max) return "wallet.validation.amountTooHigh";
  return null;
}

/* ------------------------------------------------------- superadmin → manager */

/** Runs inside the caller's transaction (account creation reuses it). */
export async function issueCreditTx(
  tx: Tx,
  actor: SessionUser,
  manager: { id: string; username: string },
  amount: number,
  options: { key?: string; note?: string } = {},
) {
  const millimes = toMillimes(amount);
  const key = options.key ?? newKey();

  const { entry, replayed } = await appendLedgerEntry(tx, {
    userId: manager.id,
    type: "ADMIN_CREDIT",
    amount: millimes,
    description: "Credit issued by the superadmin",
    idempotencyKey: `issue:${key}`,
    createdById: actor.id,
    metadata: { descriptionKey: "wallet.tx.creditIssued", note: options.note },
  });

  if (!replayed) {
    await audit({
      tx,
      action: "admin.credit.issued",
      actor,
      targetUserId: manager.id,
      targetType: "wallet",
      targetId: entry.id,
      transactionId: entry.id,
      description: `Issued ${amount.toFixed(2)} TND of credit to manager ${manager.username}`,
      metadata: { amountMillimes: millimes, reference: entry.reference, note: options.note },
    });
    await notifyUser(manager.id, {
      tx,
      kind: "credit",
      titleKey: "notify.creditReceived.title",
      bodyKey: "notify.creditReceived.body",
      params: { amount: amount.toFixed(2) },
      href: "/admin/transactions",
    });
  }
  return { entry, replayed };
}

export async function issueCreditToManager(input: CreditInput): Promise<CreditResult> {
  const actor = await requirePermission("credit.issue");

  const manager = await prisma.user.findFirst({
    where: { id: input.accountId, ...managedManagerWhere(actor) },
    select: { id: true, username: true, status: true },
  });
  if (!manager) return { ok: false, errorKey: "admin.managers.error.notFound" };
  if (manager.status !== "ACTIVE") return { ok: false, errorKey: "credit.error.accountNotActive" };

  const problem = await amountError(input.amount);
  if (problem) return { ok: false, errorKey: problem, fieldErrors: { amount: problem } };
  const cap = await getSetting("wallet.maxAdjustmentAmount");
  if (input.amount > cap) {
    return { ok: false, errorKey: "admin.wallet.error.overMax", fieldErrors: { amount: "admin.wallet.error.overMax" } };
  }

  try {
    const { entry } = await transact((tx) =>
      issueCreditTx(tx, actor, manager, input.amount, { key: input.idempotencyKey, note: input.note }),
    );
    return { ok: true, reference: entry.reference, recipientBalance: entry.balanceAfter / 1000 };
  } catch (error) {
    if (error instanceof LedgerError) return { ok: false, errorKey: error.messageKey };
    throw error;
  }
}

/* --------------------------------------------------------- manager → player */

/** Runs inside the caller's transaction (player creation reuses it). */
export async function sellCreditTx(
  tx: Tx,
  actor: SessionUser,
  player: { id: string; username: string },
  amount: number,
  options: { key?: string } = {},
) {
  const millimes = toMillimes(amount);
  const key = options.key ?? newKey();

  // The player's own deposit limits apply to credit bought for them.
  await assertDepositAllowed(player.id, millimes, tx);

  const out = await appendLedgerEntry(tx, {
    userId: actor.id,
    type: "CREDIT_TRANSFER",
    amount: -millimes,
    description: "Credit sold to a player",
    idempotencyKey: `sell:${key}`,
    createdById: actor.id,
    metadata: { descriptionKey: "wallet.tx.creditTransfer", playerId: player.id, player: player.username },
  });
  if (out.replayed) {
    // The same request, already applied: return its result, move nothing.
    return { outEntry: out.entry, inEntry: null, replayed: true as const };
  }

  const incoming = await appendLedgerEntry(tx, {
    userId: player.id,
    type: "DEPOSIT",
    amount: millimes,
    description: "Credit from your manager",
    idempotencyKey: `buy:${key}`,
    createdById: actor.id,
    relatedId: out.entry.id,
    metadata: { descriptionKey: "wallet.tx.creditFromManager" },
  });

  await audit({
    tx,
    action: "admin.credit.sold",
    actor,
    targetUserId: player.id,
    targetType: "wallet",
    targetId: incoming.entry.id,
    transactionId: incoming.entry.id,
    description: `Sold ${amount.toFixed(2)} TND of credit to ${player.username}`,
    metadata: {
      amountMillimes: millimes,
      managerReference: out.entry.reference,
      playerReference: incoming.entry.reference,
    },
  });
  await notifyUser(player.id, {
    tx,
    kind: "credit",
    titleKey: "notify.creditFromManager.title",
    bodyKey: "notify.creditFromManager.body",
    params: { amount: amount.toFixed(2) },
    href: "/account/transactions",
  });

  return { outEntry: out.entry, inEntry: incoming.entry, replayed: false as const };
}

export async function sellCreditToPlayer(input: CreditInput): Promise<CreditResult> {
  const actor = await requirePermission("credit.distribute");
  // Selling out of a balance is a manager's act; a superadmin has no float to sell.
  if (actor.role !== "manager") throw new AuthError("forbidden", "auth.error.insufficientRole");

  const player = await prisma.user.findFirst({
    where: { id: input.accountId, ...managedPlayerWhere(actor) },
    select: { id: true, username: true, status: true },
  });
  if (!player) return { ok: false, errorKey: "admin.players.error.notFound" };
  if (player.status !== "ACTIVE") return { ok: false, errorKey: "credit.error.accountNotActive" };

  const problem = await amountError(input.amount);
  if (problem) return { ok: false, errorKey: problem, fieldErrors: { amount: problem } };

  try {
    const result = await transact((tx) =>
      sellCreditTx(tx, actor, player, input.amount, { key: input.idempotencyKey }),
    );
    return {
      ok: true,
      reference: result.inEntry?.reference,
      senderBalance: result.outEntry.balanceAfter / 1000,
      recipientBalance: result.inEntry ? result.inEntry.balanceAfter / 1000 : undefined,
    };
  } catch (error) {
    if (error instanceof LedgerError) {
      return {
        ok: false,
        errorKey: error.code === "insufficient_funds" ? "credit.error.insufficientBalance" : error.messageKey,
        fieldErrors: error.code === "insufficient_funds" ? { amount: "credit.error.insufficientBalance" } : undefined,
      };
    }
    if (error instanceof AuthError) return { ok: false, errorKey: error.messageKey };
    throw error;
  }
}

/** The signed-in operator's own balance (TND). Managers watch it; the superadmin has none. */
export async function getOwnBalance(actor: SessionUser): Promise<number> {
  const wallet = await prisma.wallet.findUnique({ where: { userId: actor.id }, select: { balance: true } });
  return fromBig(wallet?.balance) / 1000;
}

export interface ManagerSummary {
  balance: number;
  playerCount: number;
  activePlayers: number;
  /** Credit sold to players, lifetime and over the last 24 hours (TND). */
  sold: number;
  soldToday: number;
  soldCount: number;
}

/** The manager's own book: balance, players, and what they have sold. */
export async function getManagerSummary(): Promise<ManagerSummary> {
  const actor = await requirePermission("credit.distribute");
  const since = new Date(Date.now() - 24 * 3600 * 1000);

  const [wallet, playerCount, activePlayers, sold, soldToday] = await Promise.all([
    prisma.wallet.findUnique({ where: { userId: actor.id }, select: { balance: true } }),
    prisma.user.count({ where: managedPlayerWhere(actor) }),
    prisma.user.count({ where: { ...managedPlayerWhere(actor), status: "ACTIVE" } }),
    prisma.transaction.aggregate({
      where: { userId: actor.id, type: "CREDIT_TRANSFER" },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.transaction.aggregate({
      where: { userId: actor.id, type: "CREDIT_TRANSFER", createdAt: { gte: since } },
      _sum: { amount: true },
    }),
  ]);

  return {
    balance: fromBig(wallet?.balance) / 1000,
    playerCount,
    activePlayers,
    sold: Math.abs(fromBig(sold._sum.amount)) / 1000,
    soldToday: Math.abs(fromBig(soldToday._sum.amount)) / 1000,
    soldCount: sold._count,
  };
}
