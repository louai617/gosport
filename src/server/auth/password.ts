/**
 * Password hashing boundary.
 *
 * ── NOT CONFIGURED IN THIS BUILD ──────────────────────────────────────────
 * `createHasher()` throws. There is no account store, no registration writes a
 * credential, and no login verifies one. A weak fallback (SHA-256, a fixed
 * salt, a "temporary" scrypt call with default parameters) would be worse than
 * nothing: it would look implemented, pass review, and ship. The refusal is
 * the design.
 * ──────────────────────────────────────────────────────────────────────────
 *
 * Requirements a real implementation must meet:
 *
 * 1. **Argon2id**, or bcrypt at cost ≥ 12 where Argon2 is unavailable. Never a
 *    bare hash function — SHA-256 and friends are fast by design, which is the
 *    opposite of what is wanted here.
 * 2. **Never log the plaintext**, not in a debug branch, not in an error
 *    message, not in a validation failure. `redact()` in `security/audit.ts`
 *    drops anything keyed like a password, and that is the last line, not the
 *    first.
 * 3. **Constant-time comparison** of the digest, which every mature library
 *    does internally — the caller's job is to not short-circuit around it. In
 *    particular, when the email is unknown, still run a verification against a
 *    dummy hash before returning: an early return turns login into a user
 *    enumeration oracle measurable over the network.
 * 4. **Rate-limited at the route** (`RATE_LIMITS.login`), because a memory-hard
 *    hash makes online guessing slow but not impossible, and because the
 *    hashing cost is itself a denial-of-service surface.
 * 5. **Re-hash on successful login** when `needsRehash` reports the stored
 *    parameters are below current policy — the plaintext is only available at
 *    that one moment, so it is the only chance to upgrade a credential.
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

/** Fallback algorithm floor, for a platform with no Argon2 binding available. */
export const BCRYPT_MIN_COST = 12;

/**
 * Upper bound on what reaches the hasher. `passwordSchema` already caps input
 * at 128 characters; this repeats it at the boundary because a megabyte of
 * "password" is a cheap way to occupy every worker in the pool.
 */
export const MAX_PASSWORD_BYTES = 128;

export class PasswordHasherUnavailableError extends Error {
  readonly code = "password_hasher_unavailable";

  constructor() {
    super(
      "Password hashing is not configured in this demo build. Install an Argon2id " +
        "binding (or bcrypt at cost >= 12), implement PasswordHasher against it, and " +
        "register it here before any credential is stored or verified.",
    );
    this.name = "PasswordHasherUnavailableError";
  }
}

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

let hasher: PasswordHasher | null = null;

/**
 * Registered once at boot by the deployment that supplies a real binding.
 * Kept as an injection point so the rest of `src/server` depends on the
 * interface and never on the library.
 */
export function setPasswordHasher(implementation: PasswordHasher): void {
  hasher = implementation;
}

/**
 * Returns the configured hasher.
 *
 * Throws in this build — see the module header. Callers must not catch this and
 * continue: a login route that treats "no hasher" as "password did not match"
 * is indistinguishable from one that treats it as "password matched" the day
 * someone inverts the condition.
 */
export function createHasher(): PasswordHasher {
  if (!hasher) throw new PasswordHasherUnavailableError();
  return hasher;
}

export function isPasswordHashingConfigured(): boolean {
  return hasher !== null;
}
