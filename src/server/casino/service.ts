import "server-only";
import { GAME_STAKE, round2 } from "@/lib/games/constants";
import { dropPlinko } from "@/lib/games/plinko";
import type { PlinkoRisk } from "@/types/games";
import { spinFromFloats } from "@/lib/games/slots";
import {
  pocketFromFloat,
  resolveRoulette,
  type RouletteBet,
} from "@/lib/games/roulette";
import {
  buildShoe,
  dealOpening,
  double,
  hit,
  playDealer,
  shuffleShoe,
  split,
  stand,
  toView,
  type BlackjackState,
  type BlackjackView,
} from "@/lib/games/blackjack";
import type { SlotsPlayResult } from "@/types/casino";
import { serverFloats } from "./rng";
import {
  awardFreeSpins,
  consumeFreeSpin,
  debit,
  getBalance,
  getFreeSpins,
  getHistory,
  getReply,
  getRound,
  openRound,
  putReply,
  settleRound,
  updateRoundState,
  type CasinoGameType,
  type CasinoTransaction,
} from "./store";

/**
 * Casino settlement.
 *
 * Everything that decides money happens here: the wager check, the randomness,
 * the payout and the ledger write. The client sends a bet and receives an
 * outcome; it cannot propose one.
 *
 * The game *maths* is reused from `src/lib/games/*`, which is pure and already
 * shared with the client — the client uses it only to animate a result the
 * server has already decided.
 */

export interface BetContext {
  sessionId: string;
  openingBalance: number;
  /** Client-supplied retry key. Same key → same answer, never a second payout. */
  idempotencyKey: string;
}

export interface CasinoError {
  ok: false;
  errorKey: string;
  balance: number;
}

export interface CasinoSuccess<T> {
  ok: true;
  balance: number;
  transaction: CasinoTransaction | null;
  roundId: string;
  result: T;
}

export type CasinoResponse<T> = CasinoSuccess<T> | CasinoError;

const MAX_ROULETTE_BETS = 40;

function invalid(balance: number, errorKey: string): CasinoError {
  return { ok: false, errorKey, balance };
}

/** Stakes are validated server-side; the client's own bounds are a courtesy. */
function validateStake(amount: unknown): number | null {
  if (typeof amount !== "number" || !Number.isFinite(amount)) return null;
  const rounded = round2(amount);
  if (rounded < GAME_STAKE.min || rounded > GAME_STAKE.max) return null;
  return rounded;
}

/**
 * Wraps a bet in the replay cache.
 *
 * The cache is written *after* settlement, so a crash mid-round leaves the
 * round open rather than caching a half-applied result.
 */
async function withIdempotency<T>(
  context: BetContext,
  run: () => Promise<CasinoResponse<T>>,
): Promise<CasinoResponse<T>> {
  const cached = getReply<CasinoResponse<T>>(
    context.sessionId,
    context.openingBalance,
    context.idempotencyKey,
  );
  if (cached) return cached;

  const response = await run();
  putReply(context.sessionId, context.openingBalance, context.idempotencyKey, response);
  return response;
}

/* ============================================================ single-shot */

/**
 * Games that resolve in one request: the wager is taken, the outcome is drawn
 * and the round is settled before the response is written.
 */
async function playInstant<T>(
  context: BetContext,
  gameType: CasinoGameType,
  stake: number,
  resolve: (floats: number[]) => { multiplier: number; result: T },
  floatCount: number,
): Promise<CasinoResponse<T>> {
  const { sessionId, openingBalance } = context;

  const taken = debit(sessionId, openingBalance, stake);
  if (!taken.ok) return invalid(taken.balance, taken.errorKey ?? "casino.error.invalidBet");

  const round = openRound(sessionId, openingBalance, gameType, stake, null);
  const { multiplier, result } = resolve(serverFloats(floatCount));
  const payout = round2(stake * multiplier);

  const transaction = settleRound(sessionId, openingBalance, round.roundId, payout, result);

  return {
    ok: true,
    balance: getBalance(sessionId, openingBalance),
    transaction,
    roundId: round.roundId,
    result,
  };
}

const SLOT_FREE_SPINS = 10;
const SLOT_FREE_SPIN_MULTIPLIER = 2;

export function playSlots(context: BetContext, rawStake: unknown) {
  const { sessionId, openingBalance } = context;
  const requested = validateStake(rawStake);

  return withIdempotency<SlotsPlayResult>(context, async () => {
    // A free spin is not charged and is played at the stake it was won at, so
    // a player cannot bank free spins at 1 and cash them at 500.
    const freeStake = consumeFreeSpin(sessionId, openingBalance);
    const isFree = freeStake !== null;
    const stake = isFree ? freeStake : requested;

    if (stake === null) {
      return invalid(getBalance(sessionId, openingBalance), "casino.error.invalidBet");
    }

    if (!isFree) {
      const taken = debit(sessionId, openingBalance, stake);
      if (!taken.ok) {
        return invalid(taken.balance, taken.errorKey ?? "games.error.insufficientBalance");
      }
    }

    const round = openRound(sessionId, openingBalance, "SLOTS", isFree ? 0 : stake, null);
    const spin = spinFromFloats(serverFloats(5));

    const paidMultiplier =
      spin.totalMultiplier * (isFree ? SLOT_FREE_SPIN_MULTIPLIER : 1);
    const payout = round2(stake * paidMultiplier);

    // Retriggers are not granted during free spins — the published RTP is
    // computed on that basis, so awarding them would make the figure wrong.
    if (!isFree && spin.freeSpinsAwarded > 0) {
      awardFreeSpins(sessionId, openingBalance, SLOT_FREE_SPINS, stake);
    }

    const result: SlotsPlayResult = {
      spin,
      paidMultiplier,
      wasFreeSpin: isFree,
      freeSpinsRemaining: getFreeSpins(sessionId, openingBalance).count,
    };

    const transaction = settleRound(sessionId, openingBalance, round.roundId, payout, result);

    return {
      ok: true as const,
      balance: getBalance(sessionId, openingBalance),
      transaction,
      roundId: round.roundId,
      result,
    };
  });
}

export function playPlinko(
  context: BetContext,
  rawStake: unknown,
  rows: unknown,
  risk: unknown,
) {
  const stake = validateStake(rawStake);
  const rowCount = rows === 8 || rows === 12 || rows === 16 ? rows : null;
  const riskLevel =
    risk === "low" || risk === "medium" || risk === "high" ? (risk as PlinkoRisk) : null;

  if (stake === null || rowCount === null || riskLevel === null) {
    return Promise.resolve(
      invalid(getBalance(context.sessionId, context.openingBalance), "casino.error.invalidBet"),
    );
  }

  return withIdempotency(context, () =>
    playInstant(
      context,
      "PLINKO",
      stake,
      (floats) => {
        const drop = dropPlinko(floats, rowCount, riskLevel);
        return { multiplier: drop.multiplier, result: drop };
      },
      rowCount,
    ),
  );
}

export function playRoulette(context: BetContext, rawBets: unknown) {
  const { sessionId, openingBalance } = context;

  if (!Array.isArray(rawBets) || rawBets.length === 0 || rawBets.length > MAX_ROULETTE_BETS) {
    return Promise.resolve(invalid(getBalance(sessionId, openingBalance), "casino.error.invalidBet"));
  }

  const bets: RouletteBet[] = [];
  for (const entry of rawBets as RouletteBet[]) {
    const amount = validateStake(entry?.amount);
    if (amount === null || typeof entry?.key !== "string") {
      return Promise.resolve(invalid(getBalance(sessionId, openingBalance), "casino.error.invalidBet"));
    }
    bets.push({ key: entry.key as RouletteBet["key"], amount });
  }

  const total = round2(bets.reduce((sum, bet) => sum + bet.amount, 0));
  if (total > GAME_STAKE.max) {
    return Promise.resolve(invalid(getBalance(sessionId, openingBalance), "casino.error.invalidBet"));
  }

  return withIdempotency(context, async () => {
    const taken = debit(sessionId, openingBalance, total);
    if (!taken.ok) {
      return invalid(taken.balance, taken.errorKey ?? "games.error.insufficientBalance");
    }

    const round = openRound(sessionId, openingBalance, "ROULETTE", total, null);
    const pocket = pocketFromFloat(serverFloats(1)[0] ?? 0);
    const outcome = resolveRoulette(bets, pocket);

    const transaction = settleRound(
      sessionId,
      openingBalance,
      round.roundId,
      outcome.totalReturn,
      outcome,
    );

    return {
      ok: true as const,
      balance: getBalance(sessionId, openingBalance),
      transaction,
      roundId: round.roundId,
      result: outcome,
    };
  });
}

/* ============================================================== blackjack */

/**
 * Blackjack spans several requests, so the shoe and the hands live in the
 * round's server state. The client is sent a view with the undealt shoe and
 * the hole card stripped — knowing either would make the game solvable.
 */
export function startBlackjack(context: BetContext, rawStake: unknown) {
  const { sessionId, openingBalance } = context;
  const stake = validateStake(rawStake);
  if (stake === null) {
    return Promise.resolve(invalid(getBalance(sessionId, openingBalance), "casino.error.invalidBet"));
  }

  return withIdempotency<BlackjackView>(context, async () => {
    const taken = debit(sessionId, openingBalance, stake);
    if (!taken.ok) {
      return invalid(taken.balance, taken.errorKey ?? "games.error.insufficientBalance");
    }

    const shoe = shuffleShoe(buildShoe(), serverFloats(buildShoe().length));
    const state = dealOpening(shoe, stake);
    const round = openRound(sessionId, openingBalance, "BLACKJACK", stake, state);

    // A natural on the deal settles immediately, with no player turn.
    let transaction: CasinoTransaction | null = null;
    if (state.phase === "settled") {
      transaction = settleRound(
        sessionId,
        openingBalance,
        round.roundId,
        state.totalReturn,
        summarise(state),
      );
    } else {
      updateRoundState(sessionId, openingBalance, round.roundId, state);
    }

    return {
      ok: true as const,
      balance: getBalance(sessionId, openingBalance),
      transaction,
      roundId: round.roundId,
      result: toView(state),
    };
  });
}

export type BlackjackAction = "hit" | "stand" | "double" | "split";

export function actBlackjack(
  context: BetContext,
  roundId: unknown,
  action: unknown,
): Promise<CasinoResponse<BlackjackView>> {
  const { sessionId, openingBalance } = context;

  if (typeof roundId !== "string") {
    return Promise.resolve(invalid(getBalance(sessionId, openingBalance), "casino.error.invalidRound"));
  }
  if (!["hit", "stand", "double", "split"].includes(String(action))) {
    return Promise.resolve(invalid(getBalance(sessionId, openingBalance), "casino.error.invalidAction"));
  }

  return withIdempotency<BlackjackView>(context, async () => {
    const round = getRound(sessionId, openingBalance, roundId);

    // A round that does not exist, belongs to someone else, or is already
    // settled cannot be acted on — this is what stops a resolved hand being
    // replayed for a second payout.
    if (!round || round.gameType !== "BLACKJACK") {
      return invalid(getBalance(sessionId, openingBalance), "casino.error.invalidRound");
    }
    if (round.status !== "OPEN") {
      return invalid(getBalance(sessionId, openingBalance), "casino.error.roundSettled");
    }

    let state = round.state as BlackjackState;

    // Doubling and splitting stake more money, so they are debited here rather
    // than taken on trust from the opening wager.
    if (action === "double" || action === "split") {
      const extra = state.hands[state.active]?.bet ?? 0;
      const taken = debit(sessionId, openingBalance, extra);
      if (!taken.ok) {
        return invalid(taken.balance, taken.errorKey ?? "games.error.insufficientBalance");
      }
    }

    if (action === "hit") state = hit(state);
    else if (action === "stand") state = stand(state);
    else if (action === "double") state = double(state);
    else state = split(state);

    if (state.phase === "dealer") state = playDealer(state);

    let transaction: CasinoTransaction | null = null;
    if (state.phase === "settled") {
      transaction = settleRound(
        sessionId,
        openingBalance,
        roundId,
        state.totalReturn,
        summarise(state),
      );
    } else {
      updateRoundState(sessionId, openingBalance, roundId, state);
    }

    return {
      ok: true as const,
      balance: getBalance(sessionId, openingBalance),
      transaction,
      roundId,
      result: toView(state),
    };
  });
}

/** History-safe summary: results and totals, never the shoe. */
function summarise(state: BlackjackState) {
  return {
    hands: state.hands.map((hand) => ({
      cards: hand.cards,
      bet: hand.bet,
      result: hand.result,
    })),
    dealer: state.dealer,
    totalStaked: state.totalStaked,
    totalReturn: state.totalReturn,
  };
}

/* ================================================================ reads */

export function readBalance(sessionId: string, openingBalance: number): number {
  return getBalance(sessionId, openingBalance);
}

export function readHistory(sessionId: string, openingBalance: number, limit = 50) {
  return getHistory(sessionId, openingBalance, limit);
}
