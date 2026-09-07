import "server-only";
import { randomUUID } from "node:crypto";

/**
 * Casino ledger — the authoritative balance for game rounds.
 *
 * ── STORAGE IS THE DEMO-GRADE PART ────────────────────────────────────────
 * State lives in a process-local Map. That is the single thing here that a
 * real deployment must replace, and the seam is deliberately narrow: every
 * function below maps onto one Prisma call against the `Wallet`,
 * `Transaction` and `Bet` models that already exist in `prisma/schema.prisma`.
 *
 * What it means today: balances reset when the dev server restarts and are not
 * shared across instances. What it does NOT mean: the client is trusted. The
 * balance, the RNG and the settlement are all on this side of the wire, which
 * is the property that actually matters and the one the browser cannot forge.
 *
 * A real implementation additionally needs the debit, the round insert and the
 * credit to happen in ONE database transaction with the wallet row locked —
 * see docs/DATABASE.md. In a single-threaded Node process the sequential code
 * below is already atomic with respect to other requests.
 * ──────────────────────────────────────────────────────────────────────────
 */

export type CasinoGameType =
  | "SLOTS"
  | "BLACKJACK"
  | "ROULETTE"
  | "PLINKO";

export type RoundStatus = "OPEN" | "SETTLED" | "VOID";

export interface CasinoTransaction {
  /** Stable id, also the settlement key. */
  transactionId: string;
  sessionId: string;
  roundId: string;
  gameType: CasinoGameType;
  betAmount: number;
  payout: number;
  /** payout - betAmount. */
  netProfit: number;
  status: RoundStatus;
  /** Serialisable summary of the outcome, for history and dispute. */
  result: unknown;
  createdAt: string;
  settledAt: string | null;
}

export interface CasinoRound {
  roundId: string;
  sessionId: string;
  gameType: CasinoGameType;
  betAmount: number;
  status: RoundStatus;
  /** Server-side game state for multi-step games. Never sent to the client. */
  state: unknown;
  createdAt: string;
}

interface SessionRecord {
  balance: number;
  transactions: CasinoTransaction[];
  rounds: Map<string, CasinoRound>;
  /** Idempotency key -> the response that was returned the first time. */
  replies: Map<string, unknown>;
  /**
   * Slots free spins owed to this session.
   *
   * Server state because it is worth money: a client-held counter could be
   * edited to grant unlimited doubled spins, and the published RTP counts the
   * free-spin round as 23.51 of its 96.74 points.
   */
  freeSpins: number;
  /** Stake the free spins were won at, so they cannot be cashed at a higher one. */
  freeSpinStake: number;
  updatedAt: number;
}

const sessions = new Map<string, SessionRecord>();

/** Bounded so a long-lived process cannot grow without limit. */
const MAX_TRANSACTIONS = 200;
const MAX_REPLIES = 200;

function record(sessionId: string, openingBalance: number): SessionRecord {
  let session = sessions.get(sessionId);
  if (!session) {
    session = {
      balance: openingBalance,
      transactions: [],
      rounds: new Map(),
      replies: new Map(),
      freeSpins: 0,
      freeSpinStake: 0,
      updatedAt: Date.now(),
    };
    sessions.set(sessionId, session);
  }
  return session;
}

export function getBalance(sessionId: string, openingBalance: number): number {
  return record(sessionId, openingBalance).balance;
}

/** Round the ledger to two places; float drift is not acceptable in a balance. */
function money(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export interface DebitResult {
  ok: boolean;
  balance: number;
  errorKey?: string;
}

/**
 * Takes the wager. Refuses rather than going negative — the balance check has
 * to be here, because the client's copy is a display value it can edit.
 */
export function debit(
  sessionId: string,
  openingBalance: number,
  amount: number,
): DebitResult {
  const session = record(sessionId, openingBalance);

  if (!(amount > 0)) {
    return { ok: false, balance: session.balance, errorKey: "casino.error.invalidBet" };
  }
  if (session.balance < amount) {
    return {
      ok: false,
      balance: session.balance,
      errorKey: "games.error.insufficientBalance",
    };
  }

  session.balance = money(session.balance - amount);
  session.updatedAt = Date.now();
  return { ok: true, balance: session.balance };
}

export function credit(sessionId: string, openingBalance: number, amount: number): number {
  const session = record(sessionId, openingBalance);
  if (amount > 0) {
    session.balance = money(session.balance + amount);
    session.updatedAt = Date.now();
  }
  return session.balance;
}

export function openRound(
  sessionId: string,
  openingBalance: number,
  gameType: CasinoGameType,
  betAmount: number,
  state: unknown,
): CasinoRound {
  const session = record(sessionId, openingBalance);
  const round: CasinoRound = {
    roundId: randomUUID(),
    sessionId,
    gameType,
    betAmount,
    status: "OPEN",
    state,
    createdAt: new Date().toISOString(),
  };
  session.rounds.set(round.roundId, round);
  return round;
}

export function getRound(
  sessionId: string,
  openingBalance: number,
  roundId: string,
): CasinoRound | null {
  return record(sessionId, openingBalance).rounds.get(roundId) ?? null;
}

export function updateRoundState(
  sessionId: string,
  openingBalance: number,
  roundId: string,
  state: unknown,
): void {
  const round = record(sessionId, openingBalance).rounds.get(roundId);
  if (round) round.state = state;
}

/**
 * Closes a round and records it.
 *
 * Returns `null` when the round is already settled. That check is what makes
 * settlement idempotent at the domain level: a retried or replayed request
 * cannot pay a second time, whatever the client sends.
 */
export function settleRound(
  sessionId: string,
  openingBalance: number,
  roundId: string,
  payout: number,
  result: unknown,
): CasinoTransaction | null {
  const session = record(sessionId, openingBalance);
  const round = session.rounds.get(roundId);
  if (!round || round.status !== "OPEN") return null;

  round.status = "SETTLED";
  if (payout > 0) credit(sessionId, openingBalance, payout);

  const transaction: CasinoTransaction = {
    transactionId: randomUUID(),
    sessionId,
    roundId,
    gameType: round.gameType,
    betAmount: round.betAmount,
    payout: money(payout),
    netProfit: money(payout - round.betAmount),
    status: "SETTLED",
    result,
    createdAt: round.createdAt,
    settledAt: new Date().toISOString(),
  };

  session.transactions.unshift(transaction);
  if (session.transactions.length > MAX_TRANSACTIONS) session.transactions.pop();

  return transaction;
}

export function getHistory(
  sessionId: string,
  openingBalance: number,
  limit = 50,
): CasinoTransaction[] {
  return record(sessionId, openingBalance).transactions.slice(0, limit);
}

/* ------------------------------------------------------------ idempotency */

/**
 * Replay cache.
 *
 * A retry after a timeout must return the *original* outcome, not roll a new
 * one — otherwise a flaky network becomes a way to re-roll a losing spin.
 */
export function getReply<T>(
  sessionId: string,
  openingBalance: number,
  key: string,
): T | undefined {
  return record(sessionId, openingBalance).replies.get(key) as T | undefined;
}

export function putReply(
  sessionId: string,
  openingBalance: number,
  key: string,
  value: unknown,
): void {
  const session = record(sessionId, openingBalance);
  session.replies.set(key, value);

  if (session.replies.size > MAX_REPLIES) {
    const oldest = session.replies.keys().next().value;
    if (oldest !== undefined) session.replies.delete(oldest);
  }
}

/* ------------------------------------------------------------- free spins */

export function getFreeSpins(sessionId: string, openingBalance: number) {
  const session = record(sessionId, openingBalance);
  return { count: session.freeSpins, stake: session.freeSpinStake };
}

export function awardFreeSpins(
  sessionId: string,
  openingBalance: number,
  count: number,
  stake: number,
): void {
  const session = record(sessionId, openingBalance);
  session.freeSpins += count;
  session.freeSpinStake = stake;
}

/** Consumes one, returning the stake it was won at. */
export function consumeFreeSpin(
  sessionId: string,
  openingBalance: number,
): number | null {
  const session = record(sessionId, openingBalance);
  if (session.freeSpins <= 0) return null;
  session.freeSpins -= 1;
  return session.freeSpinStake;
}

/** Test/debug helper; never called by a route. */
export function resetSession(sessionId: string): void {
  sessions.delete(sessionId);
}
