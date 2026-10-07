import { combinations, indexCombinations } from "@/lib/betting";

/**
 * Pure ticket settlement — no I/O, no clock, no randomness.
 *
 * Given what every leg did, this says what a ticket pays. It is the one place
 * the rules live (void legs count as odds 1.00, a lost leg kills its line, an
 * all-void line is refunded), so the admin console shows exactly the figure the
 * ledger will credit and a test can exercise every case without a database.
 *
 * All amounts are integer millimes; odds are integer milli-odds (1.833 → 1833).
 */

export type LegResult = "WON" | "LOST" | "VOID";
export type TicketMode = "single" | "multiple" | "system";

export interface SettlementLeg {
  oddsMilli: number;
  result: LegResult;
}

export interface Settlement {
  /** Total credited back to the player (stake included). */
  payoutMillimes: number;
  status: "WON" | "LOST" | "VOID";
  /** Total staked across every line — `stake` for single/multiple, lines × stake for a system. */
  totalStakeMillimes: number;
  lines: number;
}

function linePayout(stakeMillimes: number, legs: SettlementLeg[]): { payout: number; refunded: boolean } {
  if (legs.some((leg) => leg.result === "LOST")) return { payout: 0, refunded: false };

  const winners = legs.filter((leg) => leg.result === "WON");
  // Every leg void → the line never had a price: the stake comes back.
  if (winners.length === 0) return { payout: stakeMillimes, refunded: true };

  const price = winners.reduce((product, leg) => product * (leg.oddsMilli / 1000), 1);
  return { payout: Math.round(stakeMillimes * price), refunded: false };
}

/**
 * @param stakeMillimes the **total** stake recorded on the ticket.
 * @param systemSize    k in "k of n"; required for `system`.
 */
export function settleTicket(
  mode: TicketMode,
  stakeMillimes: number,
  legs: SettlementLeg[],
  systemSize?: number,
): Settlement {
  if (legs.length === 0) throw new RangeError("a ticket needs at least one leg");

  let lineLegs: SettlementLeg[][];
  let perLineStake: number;

  if (mode === "system") {
    const k = systemSize ?? 0;
    if (k < 2 || k >= legs.length) throw new RangeError("invalid system size");
    lineLegs = indexCombinations(legs.length, k).map((combo) => combo.map((i) => legs[i]!));
    perLineStake = stakeMillimes / combinations(legs.length, k);
    if (!Number.isInteger(perLineStake)) throw new RangeError("stake does not divide into lines");
  } else if (mode === "single") {
    if (legs.length !== 1) throw new RangeError("a single has exactly one leg");
    lineLegs = [legs];
    perLineStake = stakeMillimes;
  } else {
    lineLegs = [legs];
    perLineStake = stakeMillimes;
  }

  let payout = 0;
  let allRefunded = true;
  for (const line of lineLegs) {
    const result = linePayout(perLineStake, line);
    payout += result.payout;
    if (!result.refunded) allRefunded = false;
  }

  return {
    payoutMillimes: payout,
    status: allRefunded ? "VOID" : payout > 0 ? "WON" : "LOST",
    totalStakeMillimes: perLineStake * lineLegs.length,
    lines: lineLegs.length,
  };
}
