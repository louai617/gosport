import "server-only";

import { randomInt } from "node:crypto";

/**
 * Generated credentials.
 *
 * Accounts are never self-registered: a manager (for a player) or the
 * superadmin (for a manager) creates the account and receives the username and
 * password **once**, to hand over. Passwords come from the OS CSPRNG
 * (`randomInt`, rejection-sampled — no modulo bias) and are never stored or
 * logged in the clear; only the Argon2id hash is kept.
 *
 * The alphabets leave out characters that are easy to misread when a password is
 * read aloud or copied from a screenshot (0/O, 1/l/I).
 */

const LOWER = "abcdefghjkmnpqrstuvwxyz";
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGITS = "23456789";
const SYMBOLS = "!@#$%&*?-_";

function pick(alphabet: string): string {
  return alphabet[randomInt(alphabet.length)]!;
}

function shuffle<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
  return items;
}

/**
 * A password that satisfies `passwordSchema` (lower, upper and a digit, ≥ 10)
 * and, on request, the operator's longer-minimum / symbol policy.
 */
export function generatePassword(options: { minLength?: number; symbol?: boolean } = {}): string {
  const length = Math.max(12, options.minLength ?? 0);
  const required = [pick(LOWER), pick(UPPER), pick(DIGITS)];
  if (options.symbol) required.push(pick(SYMBOLS));

  const pool = LOWER + UPPER + DIGITS;
  const rest = Array.from({ length: length - required.length }, () => pick(pool));
  return shuffle([...required, ...rest]).join("");
}

const USERNAME_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

/** e.g. `p-k7m2xq` for a player, `m-x4h9tn` for a manager. */
export function generateUsername(prefix: "p" | "m"): string {
  const suffix = Array.from({ length: 6 }, () => pick(USERNAME_ALPHABET)).join("");
  return `${prefix}-${suffix}`;
}
