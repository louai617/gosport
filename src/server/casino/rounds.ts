import "server-only";

import type { Prisma } from "@prisma/client";

import { fromBig, toBig } from "@/lib/money";
import type { Tx } from "@/server/db";
import { AuthError } from "@/server/auth/guard";
import { describeEntry } from "@/server/wallet/descriptions";
import { appendLedgerEntry, newReference } from "@/server/wallet/ledger";
import { assertWagerAllowed } from "@/services/responsibleService";
import type { SessionUser } from "@/types/user";
import type { RoundProof } from "./fairness";

/**
 * Casino round lifecycle on top of the ledger.
 *
 * A round is a `Bet` row (kind CASINO). Opening one debits the stake with a BET
 * ledger entry; settling it conditionally moves OPEN → WON/LOST and credits any
 * payout with a WIN entry. Both halves run inside the caller's transaction, and
 * both carry idempotency keys derived from the round id, so:
 *
 *  - a stake is never taken without a ledger row, and never taken twice;
 *  - a round pays at most once — the settle is a conditional UPDATE, and the WIN
 *    entry's key is `settle:<roundId>`, so a retry, a double-click and a
 *    replayed request all collapse into one payment;
 *  - a round that fails halfway rolls back whole.
 */

/** A refusal the player can read; thrown to roll the transaction back. */
export class CasinoRefusal extends Error {
  constructor(readonly messageKey: string) {
    super(messageKey);
    this.name = "CasinoRefusal";
  }
}

export interface OpenedRound {
  id: string;
  reference: string;
  gameKey: string;
  /** Millimes staked so far. */
  stake: number;
  balanceAfter: number;
}

export async function openRound(
  tx: Tx,
  user: SessionUser,
  options: {
    gameKey: string;
    stakeMillimes: number;
    state: unknown;
    proof: RoundProof;
  },
): Promise<OpenedRound> {
  const { stakeMillimes } = options;
  if (stakeMillimes > 0) await assertWagerAllowed(user, stakeMillimes, tx);

  const bet = await tx.bet.create({
    data: {
      reference: newReference("CR", 8),
      userId: user.id,
      kind: "CASINO",
      gameKey: options.gameKey,
      stake: toBig(stakeMillimes),
      state: (options.state ?? undefined) as Prisma.InputJsonValue | undefined,
      result: { proof: options.proof } as unknown as Prisma.InputJsonValue,
    },
  });

  let balanceAfter: number;
  if (stakeMillimes > 0) {
    const description = describeEntry("BET", { betReference: bet.reference });
    const { entry } = await appendLedgerEntry(tx, {
      userId: user.id,
      type: "BET",
      amount: -stakeMillimes,
      description: description.description,
      idempotencyKey: `bet:${bet.id}`,
      createdById: user.id,
      betId: bet.id,
      metadata: { descriptionKey: description.descriptionKey, params: description.params, game: options.gameKey },
    });
    balanceAfter = entry.balanceAfter;
  } else {
    balanceAfter = await balanceOf(tx, user.id);
  }

  return { id: bet.id, reference: bet.reference, gameKey: options.gameKey, stake: stakeMillimes, balanceAfter };
}

/** A further stake on an open round — doubling or splitting a blackjack hand. */
export async function addStake(
  tx: Tx,
  user: SessionUser,
  round: { id: string; reference: string; version: number },
  extraMillimes: number,
): Promise<number> {
  await assertWagerAllowed(user, extraMillimes, tx);
  const description = describeEntry("BET", { betReference: round.reference });
  const { entry } = await appendLedgerEntry(tx, {
    userId: user.id,
    type: "BET",
    amount: -extraMillimes,
    description: description.description,
    // One extra stake per state version: a replay of the same action cannot debit twice.
    idempotencyKey: `stake:${round.id}:${round.version}`,
    createdById: user.id,
    betId: round.id,
    metadata: { descriptionKey: description.descriptionKey, params: description.params },
  });
  return entry.balanceAfter;
}

export async function balanceOf(tx: Tx, userId: string): Promise<number> {
  const wallet = await tx.wallet.findUnique({ where: { userId }, select: { balance: true } });
  return fromBig(wallet?.balance);
}

/**
 * Closes a round and pays it. Throws `CasinoRefusal("casino.error.roundSettled")`
 * if the round is not OPEN, which is what stops a finished hand being replayed
 * for a second payout.
 */
export async function settleRound(
  tx: Tx,
  user: SessionUser,
  round: { id: string; reference: string; stakeMillimes: number },
  payoutMillimes: number,
  result: unknown,
): Promise<number> {
  const claimed = await tx.bet.updateMany({
    where: { id: round.id, userId: user.id, status: "OPEN" },
    data: {
      status: payoutMillimes >= round.stakeMillimes && payoutMillimes > 0 ? "WON" : "LOST",
      payout: toBig(payoutMillimes),
      settledAt: new Date(),
      result: result as Prisma.InputJsonValue,
      version: { increment: 1 },
    },
  });
  if (claimed.count !== 1) throw new CasinoRefusal("casino.error.roundSettled");

  if (payoutMillimes > 0) {
    const description = describeEntry("WIN", { betReference: round.reference });
    const { entry } = await appendLedgerEntry(tx, {
      userId: user.id,
      type: "WIN",
      amount: payoutMillimes,
      description: description.description,
      idempotencyKey: `settle:${round.id}`,
      createdById: user.id,
      betId: round.id,
      metadata: { descriptionKey: description.descriptionKey, params: description.params },
    });
    return entry.balanceAfter;
  }
  return balanceOf(tx, user.id);
}

/** Maps anything a round can throw onto a player-readable i18n key. */
export function refusalKey(error: unknown): string | null {
  if (error instanceof CasinoRefusal) return error.messageKey;
  if (error instanceof AuthError) return error.messageKey;
  if (error && typeof error === "object" && "messageKey" in error && typeof (error as { messageKey: unknown }).messageKey === "string") {
    return (error as { messageKey: string }).messageKey;
  }
  return null;
}
