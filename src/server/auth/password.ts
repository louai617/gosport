import "server-only";

import { hash as argonHash, verify as argonVerify } from "@node-rs/argon2";

/**
 * Password hashing.
 *
 * Argon2id through `@node-rs/argon2` (prebuilt native binaries — no compiler
 * needed on a developer machine or on Vercel), with the OWASP baseline
 * parameters recorded in `argon2idParams` below.
 *
 * Rules this module enforces, and callers must not undo:
 *
 * 1. **Never a bare hash.** SHA-256 and friends are fast by design, which is
 *    the opposite of what is wanted for a password.
 * 2. **Never log the plaintext** — not in a debug branch, an error message or a
 *    validation failure. `redact()` in `security/audit.ts` drops any key that
 *    looks like a password, and that is the last line, not the first.
 * 3. **Constant-time behaviour.** The digest comparison is inside the library.
 *    The caller's job (see `authService.login`) is to run `verifyAgainstDummy`
 *    when the account does not exist, so "no such user" and "wrong password"
 *    cost the same and login is not a user-enumeration oracle.
 * 4. **Rehash on login.** `needsRehash` reports stored parameters below current
 *    policy; the plaintext is only in hand at login, so that is the one
 *    chance to upgrade a credential.
 */

/** Encoded PHC-string hash, e.g. `$argon2id$v=19$m=19456,t=2,p=1$…$…`. */
export type PasswordHash = string;

export interface PasswordHasher {
  hash(plaintext: string): Promise<PasswordHash>;
  /** Argument order puts the stored value first so a call never reads ambiguously. */
  verify(stored: PasswordHash, plaintext: string): Promise<boolean>;
  /** True when `stored` was produced with parameters below current policy. */
  needsRehash(stored: PasswordHash): boolean;
}

/**
 * OWASP Password Storage Cheat Sheet, Argon2id baseline: m = 19 MiB, t = 2,
 * p = 1. The three are a single operating point, not three dials — halving the
 * memory to "make it faster" undoes most of the resistance to GPU cracking
 * that motivates Argon2id in the first place. Raise `memoryCostKiB` first if
 * the hardware allows, and re-benchmark: the target is 0.5–1 s per hash on
 * production hardware under expected concurrency.
 */
export const argon2idParams = {
  type: "argon2id",
  /** Memory cost in KiB (19456 KiB = 19 MiB). */
  memoryCostKiB: 19_456,
  /** Iterations. */
  timeCost: 2,
  /** Degree of parallelism. */
  parallelism: 1,
  /** Output length in bytes. */
  hashLengthBytes: 32,
  /** Salt length in bytes — per-password, random, stored inside the PHC string. */
  saltLengthBytes: 16,
} as const;

/**
 * Upper bound on what reaches the hasher. `passwordSchema` already caps input
 * at 128 characters; this repeats it at the boundary because a megabyte of
 * "password" is a cheap way to occupy every worker in the pool.
 */
export const MAX_PASSWORD_BYTES = 128;

/* -------------------------------------------------------- PHC string parsing */

export interface Argon2Parameters {
  variant: string;
  version: number;
  memoryCostKiB: number;
  timeCost: number;
  parallelism: number;
}

/**
 * Parses the parameter section of a PHC-formatted Argon2 hash.
 *
 * Pure and library-free on purpose: it is what `needsRehash` needs to decide,
 * it is the part of this module that can be unit-tested today, and it keeps the
 * rehash policy in application code where it can be reviewed, rather than
 * inside whichever binding is chosen later.
 */
export function parseArgon2Hash(stored: string): Argon2Parameters | null {
  // $argon2id$v=19$m=19456,t=2,p=1$<salt>$<digest>
  const segments = stored.split("$");
  if (segments.length < 5) return null;

  const variant = segments[1] ?? "";
  if (!variant.startsWith("argon2")) return null;

  const version = Number(/^v=(\d+)$/.exec(segments[2] ?? "")?.[1]);
  const params = segments[3] ?? "";

  const read = (name: string): number =>
    Number(new RegExp(`(?:^|,)${name}=(\\d+)(?:,|$)`).exec(params)?.[1]);

  const memoryCostKiB = read("m");
  const timeCost = read("t");
  const parallelism = read("p");

  if (![version, memoryCostKiB, timeCost, parallelism].every(Number.isFinite)) {
    return null;
  }

  return { variant, version, memoryCostKiB, timeCost, parallelism };
}

/**
 * Policy check, split out so it can be exercised without a hasher.
 *
 * An unparseable or non-Argon2 value returns `true`: a bcrypt hash from an
 * earlier system, or anything unrecognised, should be upgraded the next time
 * the plaintext is in hand.
 */
export function isBelowPolicy(stored: string): boolean {
  const parsed = parseArgon2Hash(stored);
  if (!parsed) return true;
  if (parsed.variant !== argon2idParams.type) return true;

  return (
    parsed.memoryCostKiB < argon2idParams.memoryCostKiB ||
    parsed.timeCost < argon2idParams.timeCost ||
    parsed.parallelism < argon2idParams.parallelism
  );
}

/* --------------------------------------------------------------- the factory */

function createArgon2Hasher(): PasswordHasher {
  const options = {
    memoryCost: argon2idParams.memoryCostKiB,
    timeCost: argon2idParams.timeCost,
    parallelism: argon2idParams.parallelism,
    outputLen: argon2idParams.hashLengthBytes,
  };

  return {
    async hash(plaintext) {
      assertWithinLimit(plaintext);
      return argonHash(plaintext, options);
    },
    async verify(stored, plaintext) {
      assertWithinLimit(plaintext);
      try {
        return await argonVerify(stored, plaintext);
      } catch {
        // A malformed stored value must read as "does not match", never as a 500
        // that distinguishes this account from the rest.
        return false;
      }
    },
    needsRehash: isBelowPolicy,
  };
}

function assertWithinLimit(plaintext: string): void {
  if (Buffer.byteLength(plaintext, "utf8") > MAX_PASSWORD_BYTES * 4) {
    // `passwordSchema` caps characters at 128; this is the backstop for a caller
    // that skipped it. Four bytes is the widest UTF-8 character.
    throw new RangeError("password exceeds the maximum accepted length");
  }
}

let hasher: PasswordHasher = createArgon2Hasher();

/** Replaces the hasher — used by tests that want a cheap one. Never in a request path. */
export function setPasswordHasher(implementation: PasswordHasher): void {
  hasher = implementation;
}

export function createHasher(): PasswordHasher {
  return hasher;
}

let dummyHash: Promise<PasswordHash> | null = null;

/**
 * Verifies against a throw-away hash so a login for an unknown account spends
 * the same time as one for a real account with a wrong password.
 */
export async function verifyAgainstDummy(plaintext: string): Promise<void> {
  dummyHash ??= hasher.hash("sportgo-dummy-password-for-timing-equalisation");
  await hasher.verify(await dummyHash, plaintext);
}
