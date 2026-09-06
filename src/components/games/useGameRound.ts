"use client";

import { useCallback } from "react";
import type { GameKey, RoundOutcome } from "@/types/games";
import { generateFloats, shuffleIndices } from "@/lib/provablyFair";
import { round2 } from "@/lib/games/constants";
import { useGameStore } from "@/store/gameStore";

/**
 * The round lifecycle every original shares.
 *
 * Split into `begin` and `settle` rather than one `play()` because Crash and
 * Mines are open-ended: the stake is committed and the nonce consumed up
 * front, and the payout is decided later — on a cash-out or a bust. Folding
 * those into a single call would mean either consuming the nonce twice or
 * deciding the outcome before the player has finished acting on it.
 */

export interface BeginResult {
  serverSeed: string;
  clientSeed: string;
  nonce: number;
  serverSeedHash: string;
}

export interface SettleInput {
  gameKey: GameKey;
  stake: number;
  /** 0 on a loss. */
  multiplier: number;
  /** The raw result, shaped per game. */
  result: number;
  outcome: RoundOutcome;
  round: BeginResult;
}

export function useGameRound() {
  const debit = useGameStore((state) => state.debit);
  const credit = useGameStore((state) => state.credit);
  const consumeNonce = useGameStore((state) => state.consumeNonce);
  const recordRound = useGameStore((state) => state.recordRound);
  const setBusy = useGameStore((state) => state.setBusy);

  /**
   * Commits the stake and reserves this round's nonce.
   *
   * The nonce increments here, not at settlement: two rounds must never share
   * one, and a player who closes the tab mid-round should burn a nonce rather
   * than have the next round reuse it. Returns null when the balance cannot
   * cover the stake — the caller must not proceed.
   */
  const begin = useCallback(
    (stake: number): BeginResult | null => {
      const state = useGameStore.getState();
      if (!state.serverSeed || !state.clientSeed) return null;
      if (!debit(stake)) return null;

      return {
        serverSeed: state.serverSeed,
        serverSeedHash: state.serverSeedHash,
        clientSeed: state.clientSeed,
        nonce: consumeNonce(),
      };
    },
    [debit, consumeNonce],
  );

  /** Draws this round's randomness from the committed seed pair. */
  const draw = useCallback(
    (round: BeginResult, count: number) =>
      generateFloats(
        { serverSeed: round.serverSeed, clientSeed: round.clientSeed, nonce: round.nonce },
        count,
      ),
    [],
  );

  /** A shuffle over the same stream, for games that place items on a board. */
  const drawShuffle = useCallback(
    (round: BeginResult, length: number) =>
      shuffleIndices(
        { serverSeed: round.serverSeed, clientSeed: round.clientSeed, nonce: round.nonce },
        length,
      ),
    [],
  );

  const settle = useCallback(
    ({ gameKey, stake, multiplier, result, outcome, round }: SettleInput) => {
      const payout = round2(stake * multiplier);
      if (payout > 0) credit(payout);

      recordRound({
        gameKey,
        stake,
        multiplier,
        payout,
        profit: round2(payout - stake),
        outcome,
        result,
        serverSeedHash: round.serverSeedHash,
        clientSeed: round.clientSeed,
        nonce: round.nonce,
      });

      return payout;
    },
    [credit, recordRound],
  );

  return { begin, draw, drawShuffle, settle, setBusy };
}
