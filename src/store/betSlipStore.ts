"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { BETTING_RULES } from "@/config/app.config";
import { calculateSlip } from "@/lib/betting";
import type { BetSlipCalculation, BetSlipItem, BetSlipMode } from "@/types/betting";

/**
 * Bet-slip state.
 *
 * Client-only and deliberately self-contained: adding a selection anywhere in
 * the app (hero card, live card, market group, search result) goes through
 * `toggle`, and every surface that renders the slip reads from here.
 *
 * DEMO: `place()` does not submit a wager. It records a simulated ticket and
 * returns its reference so the UI can show a confirmation. No funds move.
 */

export interface PlacedTicket {
  reference: string;
  items: BetSlipItem[];
  mode: BetSlipMode;
  totalStake: number;
  potentialReturn: number;
  placedAt: string;
  simulated: true;
}

interface BetSlipState {
  items: BetSlipItem[];
  mode: BetSlipMode;
  sharedStake: number;
  systemSize: number;
  /** Mobile bottom sheet / desktop panel open state. */
  isOpen: boolean;
  /** Id of the selection added most recently — drives the "added" animation. */
  lastAddedId: string | null;
  acceptOddsChanges: boolean;
  lastTicket: PlacedTicket | null;

  add: (item: Omit<BetSlipItem, "stake" | "addedAt">) => void;
  remove: (selectionId: string) => void;
  toggle: (item: Omit<BetSlipItem, "stake" | "addedAt">) => void;
  clear: () => void;
  has: (selectionId: string) => boolean;

  setMode: (mode: BetSlipMode) => void;
  setSharedStake: (stake: number) => void;
  setItemStake: (selectionId: string, stake: number) => void;
  setSystemSize: (size: number) => void;
  setAcceptOddsChanges: (value: boolean) => void;

  open: () => void;
  close: () => void;
  setOpen: (value: boolean) => void;
  clearLastAdded: () => void;

  place: (reference: string, placedAt: string) => PlacedTicket | null;
  dismissTicket: () => void;
}

const MAX = BETTING_RULES.maxSelectionsPerSlip;

export const useBetSlipStore = create<BetSlipState>()(
  persist(
    (set, get) => ({
      items: [],
      mode: "single",
      sharedStake: 10,
      systemSize: 2,
      isOpen: false,
      lastAddedId: null,
      acceptOddsChanges: true,
      lastTicket: null,

      add: (item) =>
        set((state) => {
          if (state.items.some((existing) => existing.selectionId === item.selectionId)) {
            return state;
          }
          if (state.items.length >= MAX) return state;

          const next: BetSlipItem = {
            ...item,
            stake: state.sharedStake,
            addedAt: new Date().toISOString(),
          };
          const items = [...state.items, next];
          return {
            items,
            lastAddedId: item.selectionId,
            // Two or more selections almost always means the user wants a
            // combination — switch once, then respect their choice.
            mode: state.items.length === 0 ? state.mode : state.mode,
            isOpen: state.isOpen,
          };
        }),

      remove: (selectionId) =>
        set((state) => {
          const items = state.items.filter((item) => item.selectionId !== selectionId);
          return {
            items,
            mode: items.length < 2 && state.mode !== "single" ? "single" : state.mode,
            isOpen: items.length === 0 ? false : state.isOpen,
          };
        }),

      toggle: (item) => {
        const { has, add, remove } = get();
        if (has(item.selectionId)) remove(item.selectionId);
        else add(item);
      },

      clear: () => set({ items: [], mode: "single", lastAddedId: null, isOpen: false }),

      has: (selectionId) => get().items.some((item) => item.selectionId === selectionId),

      setMode: (mode) => set({ mode }),
      setSharedStake: (sharedStake) =>
        set((state) => ({
          sharedStake,
          // Keep single-line stakes in step until the user edits one directly.
          items:
            state.mode === "single"
              ? state.items.map((item) => ({ ...item, stake: sharedStake }))
              : state.items,
        })),
      setItemStake: (selectionId, stake) =>
        set((state) => ({
          items: state.items.map((item) =>
            item.selectionId === selectionId ? { ...item, stake } : item,
          ),
        })),
      setSystemSize: (systemSize) => set({ systemSize }),
      setAcceptOddsChanges: (acceptOddsChanges) => set({ acceptOddsChanges }),

      open: () => set({ isOpen: true }),
      close: () => set({ isOpen: false }),
      setOpen: (isOpen) => set({ isOpen }),
      clearLastAdded: () => set({ lastAddedId: null }),

      place: (reference, placedAt) => {
        const state = get();
        const calc = calculateSlip({
          items: state.items,
          mode: state.mode,
          sharedStake: state.sharedStake,
          systemSize: state.systemSize,
        });
        if (calc.errorKeys.length > 0 || state.items.length === 0) return null;

        const ticket: PlacedTicket = {
          reference,
          items: state.items,
          mode: state.mode,
          totalStake: calc.totalStake,
          potentialReturn: calc.potentialReturn,
          placedAt,
          simulated: true,
        };
        set({ items: [], mode: "single", lastTicket: ticket, isOpen: false });
        return ticket;
      },

      dismissTicket: () => set({ lastTicket: null }),
    }),
    {
      name: "sportgo.betslip.v1",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        items: state.items,
        mode: state.mode,
        sharedStake: state.sharedStake,
        systemSize: state.systemSize,
        acceptOddsChanges: state.acceptOddsChanges,
      }),
      version: 1,
    },
  ),
);

/** Selector helper: the derived calculation for the current slip. */
export function selectCalculation(state: BetSlipState): BetSlipCalculation {
  return calculateSlip({
    items: state.items,
    mode: state.mode,
    sharedStake: state.sharedStake,
    systemSize: state.systemSize,
  });
}
