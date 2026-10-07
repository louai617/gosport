import "server-only";

import { randomBytes } from "node:crypto";

import type { Prisma, TransactionStatus, TransactionType } from "@prisma/client";

import { fromBig, MAX_MILLIMES, toBig } from "@/lib/money";
import { isUniqueViolation, transact, type Tx } from "@/server/db";

/**
 * The ledger — the only code that changes a balance.
 *
 * Every balance-changing operation in the application funnels through
 * `appendLedgerEntry`. There is deliberately no `setBalance` and no
 * `balance += x` anywhere else: the wallet column is a *cache of the ledger*,
 * moved only by the guarded update below, in the same database transaction that
 * inserts the ledger row.
 *
 * How the guarantees are met:
 *
 * - **No negative balance / no double-spend.** A debit is one conditional
 *   `UPDATE … WHERE balance >= amount`. Two concurrent debits cannot both pass
 *   the check: the row lock serialises them, and the loser matches zero rows.
 *   There is no read-then-write window to race through. A database CHECK /
 *   trigger (see the migrations) backs it up.
 * - **No partial writes.** The guarded update, the ledger insert and any caller
 *   work (a bet row, an audit row) share one transaction.
 * - **No duplicates.** `(userId, idempotencyKey)` is unique. A retried request
 *   returns the original entry instead of moving money twice.
 * - **Traceable and immutable.** Each row records balance before and after, who
 *   caused it and why; triggers reject any later change to its money columns.
 *
 * Authorisation is NOT done here — this is an internal primitive. Callers
 * (services) authorise first.
 */

export type LedgerErrorCode = "insufficient_funds" | "invalid_amount" | "wallet_missing";

export class LedgerError extends Error {
  readonly code: LedgerErrorCode;
  readonly messageKey: string;

  constructor(code: LedgerErrorCode, messageKey: string) {
    super(`${code}: ${messageKey}`);
    this.name = "LedgerError";
    this.code = code;
    this.messageKey = messageKey;
  }
}

export interface LedgerEntryInput {
  userId: string;
  type: TransactionType;
  /** Signed integer millimes: credits positive, debits negative. Never zero. */
  amount: number;
  /** Defaults to COMPLETED. A PENDING entry still moves the balance (a held withdrawal). */
  status?: TransactionStatus;
  /** Player-safe text. Internal reasons go in `metadata` and the audit log. */
  description?: string | null;
  idempotencyKey?: string | null;
  createdById?: string | null;
  betId?: string | null;
  relatedId?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface LedgerEntry {
  id: string;
  reference: string;
  userId: string;
  type: TransactionType;
  status: TransactionStatus;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  createdAt: Date;
}

/** Crockford-style base32: no I, L, O, U — unambiguous when read aloud or typed. */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function newReference(prefix: string, length = 10): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i += 1) out += ALPHABET[bytes[i]! % 32];
  return `${prefix}-${out}`;
}

export async function ensureWallet(tx: Tx, userId: string, currency = "TND") {
  const existing = await tx.wallet.findUnique({ where: { userId } });
  if (existing) return existing;
  return tx.wallet.create({ data: { userId, currency } });
}

/**
 * Appends one entry and moves the wallet. Must be called inside a transaction
 * (`transact(tx => …)`) so it commits or rolls back together with the caller's
 * other writes.
 */
export async function appendLedgerEntry(
  tx: Tx,
  input: LedgerEntryInput,
): Promise<{ entry: LedgerEntry; replayed: boolean }> {
  const { amount } = input;
  if (!Number.isSafeInteger(amount) || amount === 0 || Math.abs(amount) > MAX_MILLIMES) {
    throw new LedgerError("invalid_amount", "wallet.validation.amountInvalid");
  }

  if (input.idempotencyKey) {
    const existing = await tx.transaction.findUnique({
      where: {
        userId_idempotencyKey: { userId: input.userId, idempotencyKey: input.idempotencyKey },
      },
    });
    if (existing) return { entry: toEntry(existing), replayed: true };
  }

  const wallet = await ensureWallet(tx, input.userId);
  const delta = toBig(amount);

  if (amount < 0) {
    // The whole race-safety argument is this one statement: the balance check
    // and the decrement are the same atomic UPDATE.
    const moved = await tx.wallet.updateMany({
      where: { id: wallet.id, balance: { gte: -delta } },
      data: { balance: { increment: delta } },
    });
    if (moved.count !== 1) {
      throw new LedgerError("insufficient_funds", "wallet.error.insufficientFunds");
    }
  } else {
    await tx.wallet.update({
      where: { id: wallet.id },
      data: { balance: { increment: delta } },
    });
  }

  // We hold the row lock until commit, so nobody else can have moved it since
  // our update: what we read now is exactly our post-update balance.
  const after = (
    await tx.wallet.findUniqueOrThrow({ where: { id: wallet.id }, select: { balance: true } })
  ).balance;

  const status = input.status ?? "COMPLETED";
  const row = await tx.transaction.create({
    data: {
      reference: newReference("TX"),
      userId: input.userId,
      walletId: wallet.id,
      type: input.type,
      status,
      amount: delta,
      balanceBefore: after - delta,
      balanceAfter: after,
      description: input.description ?? null,
      idempotencyKey: input.idempotencyKey ?? null,
      createdById: input.createdById ?? null,
      betId: input.betId ?? null,
      relatedId: input.relatedId ?? null,
      metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      settledAt: status === "PENDING" ? null : new Date(),
    },
  });

  return { entry: toEntry(row), replayed: false };
}

function toEntry(row: {
  id: string;
  reference: string;
  userId: string;
  type: TransactionType;
  status: TransactionStatus;
  amount: bigint;
  balanceBefore: bigint;
  balanceAfter: bigint;
  createdAt: Date;
}): LedgerEntry {
  return {
    id: row.id,
    reference: row.reference,
    userId: row.userId,
    type: row.type,
    status: row.status,
    amount: fromBig(row.amount),
    balanceBefore: fromBig(row.balanceBefore),
    balanceAfter: fromBig(row.balanceAfter),
    createdAt: row.createdAt,
  };
}

/**
 * Convenience for single-entry operations: opens the transaction, appends, and
 * resolves a lost idempotency race (two concurrent requests with the same key)
 * by returning the winner's entry instead of failing.
 */
export async function postEntry(
  input: LedgerEntryInput,
  inside?: (tx: Tx, entry: LedgerEntry) => Promise<void>,
): Promise<{ entry: LedgerEntry; replayed: boolean }> {
  try {
    return await transact(async (tx) => {
      const result = await appendLedgerEntry(tx, input);
      if (!result.replayed && inside) await inside(tx, result.entry);
      return result;
    });
  } catch (error) {
    if (input.idempotencyKey && isUniqueViolation(error, "idempotencyKey")) {
      return await transact(async (tx) => appendLedgerEntry(tx, { ...input }));
    }
    throw error;
  }
}

/**
 * The wallet column must always equal the sum of the ledger. This recomputes the
 * sum from the rows and reports any drift — it is read-only, and what the
 * admin "ledger integrity" indicator and the test suite assert on.
 */
export async function reconcileWallet(
  tx: Tx,
  userId: string,
): Promise<{ balance: number; ledgerSum: number; entries: number; consistent: boolean }> {
  const [wallet, sum] = await Promise.all([
    tx.wallet.findUnique({ where: { userId }, select: { balance: true } }),
    tx.transaction.aggregate({ where: { userId }, _sum: { amount: true }, _count: true }),
  ]);
  const balance = fromBig(wallet?.balance);
  const ledgerSum = fromBig(sum._sum.amount);
  return { balance, ledgerSum, entries: sum._count, consistent: balance === ledgerSum };
}
