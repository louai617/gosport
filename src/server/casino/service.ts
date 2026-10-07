import "server-only";

import type { Prisma } from "@prisma/client";

import { GAME_STAKE, floorTo2 } from "@/lib/games/constants";
import { DICE_MAX_TARGET, DICE_MIN_TARGET, settleDice } from "@/lib/games/dice";
import { dropPlinko } from "@/lib/games/plinko";
import { PLINKO_ROWS } from "@/lib/games/plinko";
import {
  isBetKey,
  pocketFromFloat,
  resolveRoulette,
  type RouletteBet,
} from "@/lib/games/roulette";
import { settleLimbo, multiplierFromFloat } from "@/lib/games/limbo";
import { MAX_MINES, MIN_MINES, TILE_COUNT, minesMultiplier } from "@/lib/games/mines";
import { resolveCrash } from "@/lib/games/crash";
import { shuffleIndicesFromFloats } from "@/lib/games/shuffle";
import { spinFromFloats } from "@/lib/games/slots";
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
import { fromBig, toMillimes } from "@/lib/money";
import { isUniqueViolation, prisma, transact, type Tx } from "@/server/db";
import { LedgerError } from "@/server/wallet/ledger";
import type { PlinkoRisk } from "@/types/games";
import type {
  CasinoEnvelope,
  CrashView,
  DicePlayResult,
  LimboPlayResult,
  MinesView,
  RoundProof,
  SlotsPlayResult,
} from "@/types/casino";
import type { SessionUser } from "@/types/user";
import { drawFloats } from "./fairness";
import { CasinoRefusal, addStake, balanceOf, openRound, refusalKey, settleRound } from "./rounds";

/**
 * Casino settlement.
 *
 * Everything that decides money happens here, on the server: the wager check,
 * the randomness (drawn from the player's committed seed pair), the payout and
 * the ledger writes. The client sends a bet and receives an outcome; it cannot
 * propose one, and it is never sent anything it could use to predict one (the
 * shoe, the mine layout, the crash point).
 *
 * The game *maths* is reused from `src/lib/games/*` — pure, and shared with the
 * browser, which uses it only to animate and to quote odds.
 *
 * Each public function is one database transaction, replay-protected by the
 * caller's idempotency key: a retry returns the original response and moves no
 * money. A function that refuses throws, so nothing it already wrote survives.
 */

export type CasinoOutcome<T> =
  | { ok: true; data: CasinoEnvelope<T> }
  | { ok: false; errorKey: string };

const SCOPE = "casino";
const FREE_SPINS_AWARDED = 10;
const FREE_SPIN_MULTIPLIER = 2;
const MAX_ROULETTE_BETS = 40;

function stakeMillimes(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) throw new CasinoRefusal("casino.error.invalidBet");
  const millimes = toMillimes(raw);
  if (millimes < toMillimes(GAME_STAKE.min) || millimes > toMillimes(GAME_STAKE.max)) {
    throw new CasinoRefusal("casino.error.invalidBet");
  }
  // Whole centimes only — the form offers no finer, and a sub-cent stake is a rounding probe.
  if (millimes % 10 !== 0) throw new CasinoRefusal("casino.error.invalidBet");
  return millimes;
}

function payoutFor(stake: number, multiplier: number): number {
  return Math.max(0, Math.round(stake * multiplier));
}

/**
 * Runs `body` as one transaction and records its response under the idempotency
 * key *in the same transaction*. A concurrent duplicate loses the unique insert,
 * rolls back (its writes vanish with it) and is answered with the winner's
 * response.
 */
async function idempotent<T>(
  user: SessionUser,
  key: string,
  body: (tx: Tx) => Promise<CasinoEnvelope<T>>,
): Promise<CasinoOutcome<T>> {
  const lookup = () =>
    prisma.idempotencyRecord.findUnique({
      where: { userId_scope_key: { userId: user.id, scope: SCOPE, key } },
    });

  const previous = await lookup();
  if (previous) return { ok: true, data: previous.response as unknown as CasinoEnvelope<T> };

  try {
    const data = await transact(async (tx) => {
      const envelope = await body(tx);
      await tx.idempotencyRecord.create({
        data: { userId: user.id, scope: SCOPE, key, response: envelope as unknown as Prisma.InputJsonValue },
      });
      return envelope;
    });
    return { ok: true, data };
  } catch (error) {
    if (isUniqueViolation(error)) {
      const winner = await lookup();
      if (winner) return { ok: true, data: winner.response as unknown as CasinoEnvelope<T> };
    }
    const messageKey = error instanceof LedgerError ? error.messageKey : refusalKey(error);
    if (messageKey) return { ok: false, errorKey: messageKey };
    throw error;
  }
}

function envelope<T>(
  round: { id: string; reference: string },
  balance: number,
  result: T,
  proof: RoundProof,
  stake: number,
  payout: number | null,
): CasinoEnvelope<T> {
  return {
    balance: balance / 1000,
    roundId: round.id,
    reference: round.reference,
    result,
    proof,
    settled: payout !== null,
    stake: stake / 1000,
    payout: payout === null ? null : payout / 1000,
  };
}

/* ============================================================== instant */

async function playInstant<T>(
  tx: Tx,
  user: SessionUser,
  options: {
    gameKey: string;
    stake: number;
    floatCount: number;
    resolve: (floats: number[]) => { multiplier: number; result: T };
  },
): Promise<CasinoEnvelope<T>> {
  const { floats, proof } = await drawFloats(tx, user.id, options.floatCount);
  const { multiplier, result } = options.resolve(floats);
  const round = await openRound(tx, user, { gameKey: options.gameKey, stakeMillimes: options.stake, state: null, proof });
  const payout = payoutFor(options.stake, multiplier);
  const balance = await settleRound(tx, user, { ...round, stakeMillimes: options.stake }, payout, { proof, outcome: result });
  return envelope(round, balance, result, proof, options.stake, payout);
}

export function playDice(
  user: SessionUser,
  key: string,
  input: { stake?: unknown; target?: unknown; direction?: unknown },
) {
  return idempotent<DicePlayResult>(user, key, async (tx) => {
    const stake = stakeMillimes(input.stake);
    const target = input.target;
    if (
      typeof target !== "number" ||
      !Number.isFinite(target) ||
      target < DICE_MIN_TARGET ||
      target > DICE_MAX_TARGET ||
      Math.abs(target * 100 - Math.round(target * 100)) > 1e-6 ||
      (input.direction !== "over" && input.direction !== "under")
    ) {
      throw new CasinoRefusal("casino.error.invalidBet");
    }
    const direction = input.direction;
    return playInstant(tx, user, {
      gameKey: "dice",
      stake,
      floatCount: 1,
      resolve: ([value]) => {
        const outcome = settleDice(value ?? 0, target, direction);
        return { multiplier: outcome.won ? outcome.multiplier : 0, result: outcome };
      },
    });
  });
}

export function playLimbo(user: SessionUser, key: string, input: { stake?: unknown; target?: unknown }) {
  return idempotent<LimboPlayResult>(user, key, async (tx) => {
    const stake = stakeMillimes(input.stake);
    const target = input.target;
    if (typeof target !== "number" || !Number.isFinite(target) || target < 1.01 || target > 1_000_000) {
      throw new CasinoRefusal("casino.error.invalidBet");
    }
    return playInstant(tx, user, {
      gameKey: "limbo",
      stake,
      floatCount: 1,
      resolve: ([value]) => {
        const outcome = settleLimbo(value ?? 0, floorTo2(target));
        return { multiplier: outcome.multiplier, result: outcome };
      },
    });
  });
}

export function playPlinko(
  user: SessionUser,
  key: string,
  input: { stake?: unknown; rows?: unknown; risk?: unknown },
) {
  return idempotent(user, key, async (tx) => {
    const stake = stakeMillimes(input.stake);
    const rows = (PLINKO_ROWS as readonly number[]).includes(input.rows as number) ? (input.rows as number) : null;
    const risk =
      input.risk === "low" || input.risk === "medium" || input.risk === "high" ? (input.risk as PlinkoRisk) : null;
    if (rows === null || risk === null) throw new CasinoRefusal("casino.error.invalidBet");

    return playInstant(tx, user, {
      gameKey: "plinko",
      stake,
      floatCount: rows,
      resolve: (floats) => {
        const drop = dropPlinko(floats, rows, risk);
        return { multiplier: drop.multiplier, result: drop };
      },
    });
  });
}

export function playRoulette(user: SessionUser, key: string, input: { bets?: unknown }) {
  return idempotent(user, key, async (tx) => {
    const raw = input.bets;
    if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_ROULETTE_BETS) {
      throw new CasinoRefusal("casino.error.invalidBet");
    }

    const bets: RouletteBet[] = [];
    let total = 0;
    for (const entry of raw as Array<{ key?: unknown; amount?: unknown }>) {
      const amount = stakeMillimes(entry?.amount);
      if (typeof entry?.key !== "string" || !isBetKey(entry.key)) throw new CasinoRefusal("casino.error.invalidBet");
      bets.push({ key: entry.key, amount: amount / 1000 });
      total += amount;
    }
    if (total > toMillimes(GAME_STAKE.max)) throw new CasinoRefusal("casino.error.invalidBet");

    return playInstant(tx, user, {
      gameKey: "roulette",
      stake: total,
      floatCount: 1,
      resolve: ([value]) => {
        const outcome = resolveRoulette(bets, pocketFromFloat(value ?? 0));
        return { multiplier: outcome.totalReturn / (total / 1000), result: outcome };
      },
    });
  });
}

export function playSlots(user: SessionUser, key: string, input: { stake?: unknown }) {
  return idempotent<SlotsPlayResult>(user, key, async (tx) => {
    // Free spins owed to the player come first and are played at the stake they
    // were won at, so a player cannot bank spins at 0.10 and cash them at 500.
    const owed = await tx.slotFreeSpins.findUnique({ where: { userId: user.id } });
    let freeStake: number | null = null;
    if (owed && owed.remaining > 0) {
      const taken = await tx.slotFreeSpins.updateMany({
        where: { userId: user.id, remaining: { gt: 0 } },
        data: { remaining: { decrement: 1 } },
      });
      if (taken.count === 1) freeStake = fromBig(owed.stake);
    }
    const isFree = freeStake !== null;
    const stake: number = freeStake ?? stakeMillimes(input.stake);

    const { floats, proof } = await drawFloats(tx, user.id, 5);
    const spin = spinFromFloats(floats);
    const paidMultiplier = spin.totalMultiplier * (isFree ? FREE_SPIN_MULTIPLIER : 1);

    // A free spin costs nothing, so there is nothing to debit and nothing to limit-check.
    const round = await openRound(tx, user, {
      gameKey: "slots",
      stakeMillimes: isFree ? 0 : stake,
      state: null,
      proof,
    });
    const payout = payoutFor(stake, paidMultiplier);

    // Retriggers are not granted during free spins — the published RTP is computed
    // on that basis, so awarding them would make the figure wrong.
    if (!isFree && spin.freeSpinsAwarded > 0) {
      await tx.slotFreeSpins.upsert({
        where: { userId: user.id },
        create: { userId: user.id, remaining: FREE_SPINS_AWARDED, stake: BigInt(stake) },
        update: { remaining: FREE_SPINS_AWARDED, stake: BigInt(stake) },
      });
    }

    const after = await tx.slotFreeSpins.findUnique({ where: { userId: user.id } });
    const result: SlotsPlayResult = {
      spin,
      paidMultiplier,
      wasFreeSpin: isFree,
      freeSpinsRemaining: after?.remaining ?? 0,
    };
    const balance = await settleRound(tx, user, { ...round, stakeMillimes: isFree ? 0 : stake }, payout, { proof, outcome: result });
    return envelope(round, balance, result, proof, isFree ? 0 : stake, payout);
  });
}

/* ============================================================= blackjack */

interface RoundRow {
  id: string;
  reference: string;
  version: number;
  stake: number;
  state: unknown;
  proof: RoundProof;
}

async function loadOpenRound(tx: Tx, user: SessionUser, roundId: unknown, gameKey: string): Promise<RoundRow> {
  if (typeof roundId !== "string") throw new CasinoRefusal("casino.error.invalidRound");
  const row = await tx.bet.findFirst({
    where: { id: roundId, userId: user.id, kind: "CASINO", gameKey },
  });
  if (!row) throw new CasinoRefusal("casino.error.invalidRound");
  if (row.status !== "OPEN") throw new CasinoRefusal("casino.error.roundSettled");
  const result = (row.result ?? {}) as { proof?: RoundProof };
  return {
    id: row.id,
    reference: row.reference,
    version: row.version,
    stake: fromBig(row.stake),
    state: row.state,
    proof: result.proof ?? { serverSeedHash: "", clientSeed: "", nonce: 0 },
  };
}

/** Optimistic write of a round's state: a concurrent request on the same round loses. */
async function saveState(tx: Tx, round: RoundRow, state: unknown, extraStake = 0): Promise<void> {
  const saved = await tx.bet.updateMany({
    where: { id: round.id, status: "OPEN", version: round.version },
    data: {
      state: state as Prisma.InputJsonValue,
      version: { increment: 1 },
      ...(extraStake > 0 ? { stake: { increment: BigInt(extraStake) } } : {}),
    },
  });
  if (saved.count !== 1) throw new CasinoRefusal("casino.error.concurrentAction");
}

function blackjackSummary(state: BlackjackState) {
  return {
    hands: state.hands.map((hand) => ({ cards: hand.cards, bet: hand.bet, result: hand.result })),
    dealer: state.dealer,
    totalStaked: state.totalStaked,
    totalReturn: state.totalReturn,
  };
}

export function startBlackjack(user: SessionUser, key: string, input: { stake?: unknown }) {
  return idempotent<BlackjackView>(user, key, async (tx) => {
    const stake = stakeMillimes(input.stake);
    const { floats, proof } = await drawFloats(tx, user.id, buildShoe().length);
    const state = dealOpening(shuffleShoe(buildShoe(), floats), stake / 1000);
    const round = await openRound(tx, user, { gameKey: "blackjack", stakeMillimes: stake, state, proof });

    // A natural on the deal settles at once, with no player turn.
    if (state.phase === "settled") {
      const payout = toMillimes(state.totalReturn);
      const balance = await settleRound(tx, user, { ...round, stakeMillimes: stake }, payout, {
        proof,
        outcome: blackjackSummary(state),
      });
      return envelope(round, balance, toView(state), proof, stake, payout);
    }
    return envelope(round, round.balanceAfter, toView(state), proof, stake, null);
  });
}

export function actBlackjack(user: SessionUser, key: string, input: { roundId: unknown; action: unknown }) {
  return idempotent<BlackjackView>(user, key, async (tx) => {
    if (!["hit", "stand", "double", "split"].includes(String(input.action))) {
      throw new CasinoRefusal("casino.error.invalidAction");
    }
    const round = await loadOpenRound(tx, user, input.roundId, "blackjack");
    let state = round.state as BlackjackState;
    let extra = 0;

    // Doubling and splitting stake more money. It is debited here, in this
    // transaction, never taken on trust from the opening wager.
    if (input.action === "double" || input.action === "split") {
      extra = toMillimes(state.hands[state.active]?.bet ?? 0);
      if (extra <= 0) throw new CasinoRefusal("casino.error.invalidAction");
      await addStake(tx, user, round, extra);
    }

    if (input.action === "hit") state = hit(state);
    else if (input.action === "stand") state = stand(state);
    else if (input.action === "double") state = double(state);
    else state = split(state);

    if (state.phase === "dealer") state = playDealer(state);

    const totalStake = round.stake + extra;
    if (state.phase === "settled") {
      await saveState(tx, round, state, extra);
      const payout = toMillimes(state.totalReturn);
      const balance = await settleRound(tx, user, { id: round.id, reference: round.reference, stakeMillimes: totalStake }, payout, {
        proof: round.proof,
        outcome: blackjackSummary(state),
      });
      return envelope(round, balance, toView(state), round.proof, totalStake, payout);
    }

    await saveState(tx, round, state, extra);
    return envelope(round, await balanceOf(tx, user.id), toView(state), round.proof, totalStake, null);
  });
}

/* ================================================================= mines */

interface MinesState {
  mineCount: number;
  mines: number[];
  revealed: number[];
}

function minesView(state: MinesState, phase: MinesView["phase"], exploded: number | null = null): MinesView {
  const finished = phase !== "playing";
  return {
    phase,
    mineCount: state.mineCount,
    revealed: state.revealed,
    mines: finished ? state.mines : null,
    exploded,
    multiplier: minesMultiplier(state.mineCount, state.revealed.length),
  };
}

export function startMines(user: SessionUser, key: string, input: { stake?: unknown; mineCount?: unknown }) {
  return idempotent<MinesView>(user, key, async (tx) => {
    const stake = stakeMillimes(input.stake);
    const count = input.mineCount;
    if (typeof count !== "number" || !Number.isInteger(count) || count < MIN_MINES || count > MAX_MINES) {
      throw new CasinoRefusal("casino.error.invalidBet");
    }
    // The board is fixed now, from the committed seed, before the first click.
    const { floats, proof } = await drawFloats(tx, user.id, TILE_COUNT - 1);
    const mines = shuffleIndicesFromFloats(TILE_COUNT, floats).slice(0, count);
    const state: MinesState = { mineCount: count, mines, revealed: [] };

    const round = await openRound(tx, user, { gameKey: "mines", stakeMillimes: stake, state, proof });
    return envelope(round, round.balanceAfter, minesView(state, "playing"), proof, stake, null);
  });
}

export function actMines(
  user: SessionUser,
  key: string,
  input: { roundId: unknown; action: unknown; tile?: unknown },
) {
  return idempotent<MinesView>(user, key, async (tx) => {
    const round = await loadOpenRound(tx, user, input.roundId, "mines");
    const state = round.state as MinesState;
    const safeTiles = TILE_COUNT - state.mineCount;
    const settleWith = async (payout: number, view: MinesView) => {
      await saveState(tx, round, state);
      const balance = await settleRound(
        tx,
        user,
        { id: round.id, reference: round.reference, stakeMillimes: round.stake },
        payout,
        { proof: round.proof, outcome: { ...view, mines: state.mines } },
      );
      return envelope(round, balance, view, round.proof, round.stake, payout);
    };

    if (input.action === "cashout") {
      if (state.revealed.length === 0) throw new CasinoRefusal("casino.error.invalidAction");
      const view = minesView(state, "cashed");
      return settleWith(payoutFor(round.stake, view.multiplier), view);
    }

    if (input.action !== "reveal") throw new CasinoRefusal("casino.error.invalidAction");
    const tile = input.tile;
    if (typeof tile !== "number" || !Number.isInteger(tile) || tile < 0 || tile >= TILE_COUNT || state.revealed.includes(tile)) {
      throw new CasinoRefusal("casino.error.invalidAction");
    }

    if (state.mines.includes(tile)) {
      return settleWith(0, minesView(state, "busted", tile));
    }

    state.revealed = [...state.revealed, tile];

    // Clearing every safe tile ends the round at the top of the ladder; leaving
    // it open would offer a cash-out with nothing left to risk.
    if (state.revealed.length === safeTiles) {
      const view = minesView(state, "cleared");
      return settleWith(payoutFor(round.stake, view.multiplier), view);
    }

    await saveState(tx, round, state);
    return envelope(round, await balanceOf(tx, user.id), minesView(state, "playing"), round.proof, round.stake, null);
  });
}

/* ================================================================= crash */

interface CrashState {
  crashPoint: number;
  startedAt: number;
  autoCashOut: number | null;
}

function crashView(state: CrashState, phase: CrashView["phase"], multiplier: number | null, now: number): CrashView {
  const ended = phase !== "running";
  return {
    phase,
    startedAt: state.startedAt,
    serverNow: now,
    autoCashOut: state.autoCashOut,
    crashPoint: ended ? state.crashPoint : null,
    multiplier: ended ? multiplier : null,
  };
}

export function startCrash(user: SessionUser, key: string, input: { stake?: unknown; autoCashOut?: unknown }) {
  return idempotent<CrashView>(user, key, async (tx) => {
    const stake = stakeMillimes(input.stake);
    let auto: number | null = null;
    if (input.autoCashOut !== undefined && input.autoCashOut !== null) {
      if (typeof input.autoCashOut !== "number" || !Number.isFinite(input.autoCashOut) || input.autoCashOut < 1.01 || input.autoCashOut > 1_000_000) {
        throw new CasinoRefusal("casino.error.invalidBet");
      }
      auto = floorTo2(input.autoCashOut);
    }

    // An abandoned round from a closed tab is settled before a new one opens.
    await settleExpiredCrash(tx, user);

    const { floats, proof } = await drawFloats(tx, user.id, 1);
    const state: CrashState = { crashPoint: multiplierFromFloat(floats[0] ?? 0), startedAt: Date.now(), autoCashOut: auto };
    const round = await openRound(tx, user, { gameKey: "crash", stakeMillimes: stake, state, proof });
    return envelope(round, round.balanceAfter, crashView(state, "running", null, Date.now()), proof, stake, null);
  });
}

/** Settles any crash round whose outcome is already determined by the clock. */
async function settleExpiredCrash(tx: Tx, user: SessionUser): Promise<void> {
  const open = await tx.bet.findMany({ where: { userId: user.id, kind: "CASINO", gameKey: "crash", status: "OPEN" } });
  const now = Date.now();
  for (const row of open) {
    const state = row.state as unknown as CrashState;
    const resolution = resolveCrash(state.crashPoint, state.autoCashOut, now - state.startedAt);
    if (resolution.phase === "running") continue;
    const stake = fromBig(row.stake);
    const payout = resolution.phase === "cashed" ? payoutFor(stake, resolution.multiplier) : 0;
    const view = crashView(state, resolution.phase, resolution.multiplier, now);
    const proof = ((row.result ?? {}) as { proof?: RoundProof }).proof!;
    await settleRound(tx, user, { id: row.id, reference: row.reference, stakeMillimes: stake }, payout, { proof, outcome: view });
  }
}

export function actCrash(user: SessionUser, key: string, input: { roundId: unknown; action: unknown }) {
  return idempotent<CrashView>(user, key, async (tx) => {
    if (input.action !== "cashout" && input.action !== "sync") throw new CasinoRefusal("casino.error.invalidAction");
    const round = await loadOpenRound(tx, user, input.roundId, "crash");
    const state = round.state as CrashState;
    const now = Date.now();

    // The server's clock decides. A client that claims it cashed out at 50× a
    // second ago is simply asking where the curve is *now*.
    let resolution = resolveCrash(state.crashPoint, state.autoCashOut, now - state.startedAt);

    if (resolution.phase === "running") {
      if (input.action === "sync") {
        return envelope(round, await balanceOf(tx, user.id), crashView(state, "running", null, now), round.proof, round.stake, null);
      }
      resolution = { phase: "cashed", multiplier: resolution.multiplier };
    }

    const payout = resolution.phase === "cashed" ? payoutFor(round.stake, resolution.multiplier) : 0;
    const view = crashView(state, resolution.phase, resolution.multiplier, now);
    await saveState(tx, round, state);
    const balance = await settleRound(tx, user, { id: round.id, reference: round.reference, stakeMillimes: round.stake }, payout, {
      proof: round.proof,
      outcome: view,
    });
    return envelope(round, balance, view, round.proof, round.stake, payout);
  });
}

/* ======================================================= resume & history */

export type ActiveRound =
  | { game: "blackjack"; envelope: CasinoEnvelope<BlackjackView> }
  | { game: "mines"; envelope: CasinoEnvelope<MinesView> }
  | { game: "crash"; envelope: CasinoEnvelope<CrashView> };

/**
 * The player's open round for a game, so a reload resumes the hand instead of
 * stranding the stake. Read-only apart from settling a crash round whose outcome
 * the clock has already decided.
 */
export async function getActiveRound(
  user: SessionUser,
  game: "blackjack" | "mines" | "crash",
  roundId?: string,
): Promise<ActiveRound | null> {
  if (game === "crash") await transact((tx) => settleExpiredCrash(tx, user));

  const row = await prisma.bet.findFirst({
    where: roundId
      ? { id: roundId, userId: user.id, kind: "CASINO", gameKey: game }
      : { userId: user.id, kind: "CASINO", gameKey: game, status: "OPEN" },
    orderBy: { placedAt: "desc" },
  });
  if (!row) return null;

  // Asked about a specific crash round that has since ended: report how it ended.
  // This is what lets the browser — which must not know the bust point — learn
  // the outcome by polling, instead of the server pushing the answer early.
  if (game === "crash" && row.status !== "OPEN") {
    const stored = (row.result ?? {}) as { proof?: RoundProof; outcome?: CrashView };
    const balance = fromBig((await prisma.wallet.findUnique({ where: { userId: user.id } }))?.balance);
    return {
      game,
      envelope: envelope(
        { id: row.id, reference: row.reference },
        balance,
        stored.outcome as CrashView,
        stored.proof!,
        fromBig(row.stake),
        fromBig(row.payout),
      ),
    };
  }

  const proof = ((row.result ?? {}) as { proof?: RoundProof }).proof!;
  const stake = fromBig(row.stake);
  const balance = fromBig((await prisma.wallet.findUnique({ where: { userId: user.id } }))?.balance);
  const base = { id: row.id, reference: row.reference };

  if (game === "blackjack") {
    return { game, envelope: envelope(base, balance, toView(row.state as unknown as BlackjackState), proof, stake, null) };
  }
  if (game === "mines") {
    return { game, envelope: envelope(base, balance, minesView(row.state as unknown as MinesState, "playing"), proof, stake, null) };
  }
  const state = row.state as unknown as CrashState;
  return { game, envelope: envelope(base, balance, crashView(state, "running", null, Date.now()), proof, stake, null) };
}

export interface HistoryRow {
  id: string;
  reference: string;
  gameKey: string;
  stake: number;
  payout: number;
  /** payout ÷ stake; for a free spin (no stake) the payout itself is shown as a win. */
  multiplier: number;
  profit: number;
  placedAt: string;
  proof: RoundProof | null;
}

export async function getHistory(user: SessionUser, game: string | undefined, limit = 30): Promise<HistoryRow[]> {
  const rows = await prisma.bet.findMany({
    where: { userId: user.id, kind: "CASINO", status: { not: "OPEN" }, ...(game ? { gameKey: game } : {}) },
    orderBy: [{ placedAt: "desc" }, { id: "desc" }],
    take: Math.min(Math.max(limit, 1), 100),
  });

  return rows.map((row) => {
    const stake = fromBig(row.stake);
    const payout = fromBig(row.payout);
    return {
      id: row.id,
      reference: row.reference,
      gameKey: row.gameKey ?? "",
      stake: stake / 1000,
      payout: payout / 1000,
      multiplier: stake > 0 ? payout / stake : payout > 0 ? 1 : 0,
      profit: (payout - stake) / 1000,
      placedAt: row.placedAt.toISOString(),
      proof: ((row.result ?? {}) as { proof?: RoundProof }).proof ?? null,
    };
  });
}
