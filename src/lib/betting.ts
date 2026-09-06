import { BETTING_RULES } from "@/config/app.config";
import type { BetSlipCalculation, BetSlipItem, BetSlipMode } from "@/types/betting";

/**
 * Bet-slip mathematics.
 *
 * Pure functions, no I/O, no state. These power the on-screen "potential
 * return" figure only.
 *
 * ── SIMULATION ONLY ───────────────────────────────────────────────────────
 * Nothing here places a wager, debits a balance or moves money. The numbers
 * are an arithmetic preview against simulated odds so the interface can be
 * evaluated. A licensed operator would compute and settle returns server-side
 * against a certified pricing engine, never in the browser.
 * ──────────────────────────────────────────────────────────────────────────
 */

/** Rounds to 2dp using integer arithmetic to avoid float drift on display. */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function combinedOdds(items: BetSlipItem[]): number {
  return items.reduce((product, item) => product * item.odds, 1);
}

/** n choose k. */
export function combinations(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let result = 1;
  for (let i = 1; i <= k; i += 1) {
    result = (result * (n - k + i)) / i;
  }
  return Math.round(result);
}

/** All k-sized index combinations of `length` items. */
function indexCombinations(length: number, k: number): number[][] {
  const out: number[][] = [];
  const current: number[] = [];
  const walk = (start: number) => {
    if (current.length === k) {
      out.push([...current]);
      return;
    }
    for (let i = start; i < length; i += 1) {
      current.push(i);
      walk(i + 1);
      current.pop();
    }
  };
  walk(0);
  return out;
}

export interface CalculateInput {
  items: BetSlipItem[];
  mode: BetSlipMode;
  /** Stake applied to every line in multiple/system mode. */
  sharedStake: number;
  /** Chosen k for system bets (e.g. 2 for a 2/4 system). */
  systemSize: number;
}

export function calculateSlip({
  items,
  mode,
  sharedStake,
  systemSize,
}: CalculateInput): BetSlipCalculation {
  const active = items.filter((item) => !item.suspended);
  const warningKeys: string[] = [];
  const errorKeys: string[] = [];

  if (items.some((item) => item.suspended)) warningKeys.push("betslip.warning.suspended");
  if (items.some((item) => item.previousOdds && item.previousOdds !== item.odds)) {
    warningKeys.push("betslip.warning.oddsChanged");
  }

  // Two selections from the same event cannot be combined on one ticket.
  const eventIds = active.map((item) => item.eventId);
  const hasSameEventConflict = new Set(eventIds).size !== eventIds.length;

  if (items.length > BETTING_RULES.maxSelectionsPerSlip) {
    errorKeys.push("betslip.error.tooManySelections");
  }

  if (mode === "single") {
    const lines = active.filter((item) => item.stake > 0);
    const totalStake = round2(lines.reduce((sum, item) => sum + item.stake, 0));
    const potentialReturn = round2(
      lines.reduce((sum, item) => sum + item.stake * item.odds, 0),
    );

    if (lines.some((item) => item.stake < BETTING_RULES.minStake)) {
      errorKeys.push("betslip.error.minStake");
    }
    if (lines.some((item) => item.stake > BETTING_RULES.maxStake)) {
      errorKeys.push("betslip.error.maxStake");
    }
    if (active.length === 0) errorKeys.push("betslip.error.noSelections");

    return {
      mode,
      selectionCount: active.length,
      totalStake,
      potentialReturn: capReturn(potentialReturn, warningKeys),
      potentialProfit: round2(capReturn(potentialReturn, []) - totalStake),
      warningKeys,
      errorKeys,
    };
  }

  if (mode === "multiple") {
    const odds = combinedOdds(active);
    const totalStake = round2(sharedStake);
    const gross = round2(totalStake * odds);

    if (active.length < BETTING_RULES.minSelectionsForMultiple) {
      errorKeys.push("betslip.error.needTwoForMultiple");
    }
    if (hasSameEventConflict) errorKeys.push("betslip.error.sameEvent");
    if (totalStake > 0 && totalStake < BETTING_RULES.minStake) {
      errorKeys.push("betslip.error.minStake");
    }
    if (totalStake > BETTING_RULES.maxStake) errorKeys.push("betslip.error.maxStake");
    if (odds > BETTING_RULES.maxCombinedOdds) warningKeys.push("betslip.warning.oddsCapped");

    return {
      mode,
      selectionCount: active.length,
      totalStake,
      combinedOdds: round2(Math.min(odds, BETTING_RULES.maxCombinedOdds)),
      potentialReturn: capReturn(gross, warningKeys),
      potentialProfit: round2(capReturn(gross, []) - totalStake),
      warningKeys,
      errorKeys,
    };
  }

  // System: every k-of-n combination becomes its own line, each carrying the
  // shared stake. Total outlay is stake x number of lines.
  const n = active.length;
  const k = Math.min(Math.max(systemSize, 2), Math.max(n - 1, 2));
  const lines = indexCombinations(n, k);
  const totalStake = round2(sharedStake * lines.length);

  const maxReturn = lines.reduce((sum, combo) => {
    const odds = combo.reduce((product, index) => product * (active[index]?.odds ?? 1), 1);
    return sum + sharedStake * odds;
  }, 0);

  if (n < BETTING_RULES.minSelectionsForSystem) {
    errorKeys.push("betslip.error.needThreeForSystem");
  }
  if (hasSameEventConflict) errorKeys.push("betslip.error.sameEvent");
  if (sharedStake > 0 && sharedStake < BETTING_RULES.minStake) {
    errorKeys.push("betslip.error.minStake");
  }
  if (totalStake > BETTING_RULES.maxStake) errorKeys.push("betslip.error.maxStake");

  return {
    mode,
    selectionCount: n,
    totalStake,
    potentialReturn: capReturn(round2(maxReturn), warningKeys),
    potentialProfit: round2(capReturn(round2(maxReturn), []) - totalStake),
    warningKeys,
    errorKeys,
    systemLines: lines.length,
  };
}

function capReturn(value: number, warningKeys: string[]): number {
  if (value > BETTING_RULES.maxPotentialReturn) {
    if (!warningKeys.includes("betslip.warning.returnCapped")) {
      warningKeys.push("betslip.warning.returnCapped");
    }
    return BETTING_RULES.maxPotentialReturn;
  }
  return value;
}

/** Valid system sizes for n selections: 2 .. n-1. */
export function systemSizesFor(n: number): number[] {
  if (n < 3) return [];
  return Array.from({ length: n - 2 }, (_, i) => i + 2);
}
