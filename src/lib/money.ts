/**
 * Money.
 *
 * The ledger stores integer **millimes** (1 TND = 1000 millimes — the dinar has
 * three minor digits). Floating point cannot represent 0.001 exactly, so any
 * arithmetic on balances happens on integers and only crosses into decimal at
 * the edge of the UI.
 *
 * Isomorphic and import-free on purpose: the browser formats with it, the
 * server does arithmetic with it, and a scripted test can load it directly.
 */

export const MILLIMES_PER_UNIT = 1000;

/** Largest balance the app will represent: comfortably inside Number's safe range. */
export const MAX_MILLIMES = 9_000_000_000_000_000; // 9 × 10^15 millimes = 9 × 10^12 TND

/** Decimal TND → integer millimes. Rejects anything that is not a finite number. */
export function toMillimes(amount: number): number {
  if (!Number.isFinite(amount)) throw new RangeError("amount must be a finite number");
  const millimes = Math.round(amount * MILLIMES_PER_UNIT);
  if (!Number.isSafeInteger(millimes) || Math.abs(millimes) > MAX_MILLIMES) {
    throw new RangeError("amount is out of range");
  }
  return millimes;
}

/** Integer millimes → decimal TND, for display only. */
export function fromMillimes(millimes: number | bigint): number {
  return Number(millimes) / MILLIMES_PER_UNIT;
}

/** Database boundary: `BigInt` columns ⇄ the app's integer `number` millimes. */
export function toBig(millimes: number): bigint {
  if (!Number.isSafeInteger(millimes)) throw new RangeError("millimes must be a safe integer");
  return BigInt(millimes);
}

export function fromBig(value: bigint | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new RangeError("stored amount exceeds safe range");
  return number;
}

export function fromBigOrNull(value: bigint | null | undefined): number | null {
  return value === null || value === undefined ? null : fromBig(value);
}
