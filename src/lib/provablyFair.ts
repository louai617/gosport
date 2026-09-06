/**
 * Provably-fair randomness.
 *
 * The commit–reveal scheme used across licensed casino originals:
 *
 *   1. The server generates a secret `serverSeed` and publishes only its
 *      SHA-256 hash. That is the commitment — it fixes the seed before any
 *      bet is placed and cannot be changed afterwards.
 *   2. The player supplies a `clientSeed` they can edit at any time, so the
 *      operator cannot know the full input in advance either.
 *   3. Each bet increments a `nonce`. The outcome comes from
 *      `HMAC-SHA256(key = serverSeed, message = "clientSeed:nonce:cursor")`.
 *   4. When the player rotates their seed, the old `serverSeed` is revealed.
 *      They can then re-derive every past round and check each one against the
 *      hash they were shown before they bet.
 *
 * ── WHAT THIS BUILD ACTUALLY PROVES ───────────────────────────────────────
 * The arithmetic here is the real scheme and verifies correctly. The *trust
 * guarantee* does not exist in this build, because the demo has no server:
 * the seed is generated in the browser, so nothing was committed to by a party
 * that could not also change it. Provably fair is only meaningful when the
 * server generates and holds the seed, publishes the hash before the bet, and
 * computes the outcome server-side. `docs/GAMES.md` records that.
 * ──────────────────────────────────────────────────────────────────────────
 */

const encoder = new TextEncoder();

/** Web Crypto is present in modern browsers and in Node 18+. */
function subtle(): SubtleCrypto {
  const value = globalThis.crypto?.subtle;
  if (!value) {
    throw new Error("Web Crypto is unavailable; provably-fair cannot run here");
  }
  return value;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** 32 random bytes as hex — the shape a server seed takes in production. */
export function randomSeed(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  globalThis.crypto.getRandomValues(bytes);
  return toHex(bytes);
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await subtle().digest("SHA-256", encoder.encode(value));
  return toHex(new Uint8Array(digest));
}

async function hmacSha256(key: string, message: string): Promise<Uint8Array> {
  const cryptoKey = await subtle().importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await subtle().sign("HMAC", cryptoKey, encoder.encode(message));
  return new Uint8Array(signature);
}

export interface SeedInput {
  serverSeed: string;
  clientSeed: string;
  nonce: number;
}

/**
 * Converts four bytes to a float in [0, 1).
 *
 * Each byte contributes a successive base-256 place, which spreads the entropy
 * of all four evenly instead of letting the first byte dominate. Dividing a
 * single byte by 256 would give only 256 distinct outcomes — visibly banded on
 * a multiplier curve.
 */
function bytesToFloat(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] ?? 0) / 256 +
    (bytes[offset + 1] ?? 0) / 256 ** 2 +
    (bytes[offset + 2] ?? 0) / 256 ** 3 +
    (bytes[offset + 3] ?? 0) / 256 ** 4
  );
}

const BYTES_PER_DIGEST = 32;
const BYTES_PER_FLOAT = 4;
const FLOATS_PER_DIGEST = BYTES_PER_DIGEST / BYTES_PER_FLOAT; // 8

/**
 * `count` floats in [0, 1) for one round.
 *
 * A single HMAC yields eight floats. Games needing more (Mines shuffles 25
 * tiles) advance a `cursor` in the message, so the stream is deterministic and
 * unbounded while every float still traces back to one server seed.
 */
export async function generateFloats(
  { serverSeed, clientSeed, nonce }: SeedInput,
  count: number,
): Promise<number[]> {
  const floats: number[] = [];

  for (let cursor = 0; floats.length < count; cursor += 1) {
    const digest = await hmacSha256(serverSeed, `${clientSeed}:${nonce}:${cursor}`);
    for (let offset = 0; offset < FLOATS_PER_DIGEST && floats.length < count; offset += 1) {
      floats.push(bytesToFloat(digest, offset * BYTES_PER_FLOAT));
    }
  }

  return floats;
}

/** Convenience for the many games that need exactly one number. */
export async function generateFloat(input: SeedInput): Promise<number> {
  const [value] = await generateFloats(input, 1);
  return value ?? 0;
}

/**
 * Fisher–Yates driven by the same float stream.
 *
 * Used by Mines to place bombs. Selecting `n` random indices independently
 * would collide and need rejection, which breaks the one-float-per-step
 * property a verifier relies on; a shuffle consumes a fixed, predictable
 * number of floats.
 */
export async function shuffleIndices(
  input: SeedInput,
  length: number,
): Promise<number[]> {
  const indices = Array.from({ length }, (_, index) => index);
  const floats = await generateFloats(input, Math.max(0, length - 1));

  for (let i = length - 1; i > 0; i -= 1) {
    const draw = floats[length - 1 - i] ?? 0;
    const j = Math.floor(draw * (i + 1));
    const a = indices[i]!;
    const b = indices[j]!;
    indices[i] = b;
    indices[j] = a;
  }

  return indices;
}

/**
 * Re-derives a past round from a revealed server seed.
 *
 * This is the whole point of the scheme: after rotation the player runs the
 * same inputs through the same function and compares. The verifier page calls
 * exactly this, with no privileged access of any kind.
 */
export interface VerificationResult {
  /** True when the revealed seed hashes to the commitment shown before the bet. */
  seedMatchesCommitment: boolean;
  floats: number[];
}

export async function verifyRound(
  input: SeedInput,
  expectedServerSeedHash: string,
  floatCount = 1,
): Promise<VerificationResult> {
  const [hash, floats] = await Promise.all([
    sha256Hex(input.serverSeed),
    generateFloats(input, floatCount),
  ]);

  return {
    seedMatchesCommitment: hash === expectedServerSeedHash.toLowerCase(),
    floats,
  };
}
