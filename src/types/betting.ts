import type { MarketKey, SelectionOutcome } from "./sports";

/**
 * Betting domain model.
 *
 * DEMO MODE: every value here is simulated. `stake`, `potentialReturn` and
 * `balance` are numbers in a sandbox ledger — they are not money, and nothing
 * in this codebase moves funds.
 */

export type BetSlipMode = "single" | "multiple" | "system";

/** A user selection sitting in the bet slip, denormalised for display. */
export interface BetSlipItem {
  /** Equals the underlying `Selection.id` — one entry per selection. */
  id: string;
  selectionId: string;
  marketId: string;
  eventId: string;
  /** Snapshot of display data so the slip renders without refetching. */
  eventLabel: string;
  competitionLabel: string;
  marketNameKey: string;
  marketKey: MarketKey;
  marketLine?: number;
  outcome: SelectionOutcome;
  selectionLabelKey?: string;
  selectionLabel?: string;
  odds: number;
  /** Set when the price moved after the selection was added. */
  previousOdds?: number;
  /** Per-selection stake, used in `single` mode only. */
  stake: number;
  /** True when the market was suspended after the item was added. */
  suspended: boolean;
  /** ISO-8601 of when it was added — drives ordering and the "new" animation. */
  addedAt: string;
  startTime: string;
}

/** Result of the (local, simulated) stake calculation. */
export interface BetSlipCalculation {
  mode: BetSlipMode;
  selectionCount: number;
  /** Sum of stakes across the lines actually being placed. */
  totalStake: number;
  /** Product of odds for `multiple`; undefined for `single`/`system`. */
  combinedOdds?: number;
  /** Gross return including stake. */
  potentialReturn: number;
  /** potentialReturn - totalStake. */
  potentialProfit: number;
  /** Non-blocking notices, e.g. "same event conflict". i18n keys. */
  warningKeys: string[];
  /** Blocking problems — placement is disabled while non-empty. i18n keys. */
  errorKeys: string[];
  /** System-bet combinations, e.g. 2/3 -> 3 lines. */
  systemLines?: number;
}

export type BetStatus = "pending" | "won" | "lost" | "cancelled" | "cashed_out" | "void";

export interface BetSelectionRecord {
  id: string;
  eventId?: string;
  eventLabel: string;
  competitionLabel: string;
  marketNameKey: string;
  marketLine?: number;
  /** A proper noun, or an i18n key when `selectionLabelKey` is set. */
  selectionLabel: string;
  selectionLabelKey?: string;
  odds: number;
  status: BetStatus;
  startTime: string;
}

export interface Bet {
  id: string;
  /** Short human reference shown in the UI, e.g. `SG-4F2A19`. */
  reference: string;
  userId: string;
  /** A sportsbook ticket or a casino round. */
  kind: "sports" | "casino";
  /** Casino only: slots, blackjack, roulette, … */
  gameKey?: string;
  systemSize?: number;
  mode: BetSlipMode;
  selections: BetSelectionRecord[];
  stake: number;
  totalOdds: number;
  potentialReturn: number;
  /** Settled payout; null while pending. */
  payout: number | null;
  status: BetStatus;
  placedAt: string;
  settledAt: string | null;
  /** Always true in this build. Guards any accidental live-mode rendering. */
  simulated: boolean;
}
