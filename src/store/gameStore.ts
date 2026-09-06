"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { GameKey, GameRound, RoundOutcome } from "@/types/games";
import { randomSeed, sha256Hex } from "@/lib/provablyFair";
import { round2 } from "@/lib/games/constants";

/**
 * Casino session state.
 *
 * ── SIMULATED, AND CLIENT-SIDE ────────────────────────────────────────────
 * `balance` is a session number in the browser. It is not the wallet, it is
 * not money, and it resets. The server seed lives here too, which is exactly
 * what a real implementation must never do — see `src/lib/provablyFair.ts`.
 * Both facts are surfaced in the UI rather than left in a comment.
 * ──────────────────────────────────────────────────────────────────────────
 */

/** Starting session credit, so a player can try a game without a wallet flow. */
export const STARTING_BALANCE = 250;

const MAX_HISTORY = 50;

interface SeedPair {
  serverSeed: string;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
}

interface GameState {
  balance: number;
  ready: boolean;

  serverSeed: string;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  /** Revealed on rotation so past rounds stay checkable. */
  previousPair: SeedPair | null;

  history: GameRound[];
  /** Guards double-submits while a round animates. */
  busy: boolean;

  initialise: () => Promise<void>;
  setClientSeed: (seed: string) => void;
  rotateSeeds: (clientSeed?: string) => Promise<void>;

  /** Debits the stake. Returns false when the balance cannot cover it. */
  debit: (amount: number) => boolean;
  credit: (amount: number) => void;
  consumeNonce: () => number;
  setBusy: (busy: boolean) => void;

  recordRound: (round: Omit<GameRound, "id" | "playedAt" | "simulated">) => void;
  resetSession: () => Promise<void>;
}

async function freshPair(clientSeed: string): Promise<Omit<SeedPair, "nonce">> {
  const serverSeed = randomSeed();
  return { serverSeed, serverSeedHash: await sha256Hex(serverSeed), clientSeed };
}

export const useGameStore = create<GameState>()(
  persist(
    (set, get) => ({
      balance: STARTING_BALANCE,
      ready: false,

      serverSeed: "",
      serverSeedHash: "",
      clientSeed: "",
      nonce: 0,
      previousPair: null,
      history: [],
      busy: false,

      initialise: async () => {
        // Seeds cannot be created during SSR (no Web Crypto, and the value
        // would differ between render and hydration), so the first client
        // render mints them.
        if (get().serverSeed && get().clientSeed) {
          set({ ready: true });
          return;
        }

        const clientSeed = get().clientSeed || randomSeed(8);
        const pair = await freshPair(clientSeed);
        set({ ...pair, nonce: 0, ready: true });
      },

      setClientSeed: (clientSeed) => set({ clientSeed }),

      rotateSeeds: async (clientSeed) => {
        const state = get();

        // The pair being retired is kept in full, including the seed that was
        // secret until this moment. That reveal is the entire point of the
        // commitment: without it the earlier hash proves nothing.
        const previousPair: SeedPair = {
          serverSeed: state.serverSeed,
          serverSeedHash: state.serverSeedHash,
          clientSeed: state.clientSeed,
          nonce: state.nonce,
        };

        const pair = await freshPair(clientSeed?.trim() || randomSeed(8));
        set({ ...pair, nonce: 0, previousPair });
      },

      debit: (amount) => {
        const { balance } = get();
        if (amount <= 0 || amount > balance) return false;
        set({ balance: round2(balance - amount) });
        return true;
      },

      credit: (amount) => {
        if (amount <= 0) return;
        set({ balance: round2(get().balance + amount) });
      },

      consumeNonce: () => {
        const nonce = get().nonce;
        set({ nonce: nonce + 1 });
        return nonce;
      },

      setBusy: (busy) => set({ busy }),

      recordRound: (round) =>
        set((state) => {
          const entry: GameRound = {
            ...round,
            id: `round-${state.serverSeedHash.slice(0, 6)}-${round.nonce}`,
            playedAt: new Date().toISOString(),
            simulated: true,
          };
          return { history: [entry, ...state.history].slice(0, MAX_HISTORY) };
        }),

      resetSession: async () => {
        const pair = await freshPair(randomSeed(8));
        set({
          ...pair,
          nonce: 0,
          previousPair: null,
          balance: STARTING_BALANCE,
          history: [],
          busy: false,
        });
      },
    }),
    {
      name: "sportgo.casino.v1",
      storage: createJSONStorage(() => localStorage),
      version: 1,
      partialize: (state) => ({
        balance: state.balance,
        serverSeed: state.serverSeed,
        serverSeedHash: state.serverSeedHash,
        clientSeed: state.clientSeed,
        nonce: state.nonce,
        previousPair: state.previousPair,
        history: state.history,
      }),
    },
  ),
);

/** Outcome helper shared by every game board. */
export function outcomeOf(won: boolean, cashedOut = false): RoundOutcome {
  if (cashedOut) return "cashed_out";
  return won ? "won" : "lost";
}

export type { GameKey };
