import "server-only";

import { createHash, createHmac, randomBytes } from "node:crypto";

import { prisma, transact, type Tx } from "@/server/db";

/**
 * Provably fair randomness, held server-side.
 *
 * Every casino round draws its randomness from a seed pair the player can audit:
 *
 *   commitment  = SHA-256(serverSeed)          shown BEFORE any bet
 *   float(i)    = HMAC-SHA256(serverSeed, `${clientSeed}:${nonce}:${cursor}`)
 *
 * The player chooses the client seed; the nonce counts rounds on the pair. When
 * the player rotates, the old server seed is *revealed*, and anyone can check
 * that its hash equals the commitment they were shown and that every past round
 * reproduces from (serverSeed, clientSeed, nonce). The server therefore cannot
 * choose an outcome after seeing a bet, and cannot swap the seed afterwards.
 *
 * Two safeguards that matter and are easy to miss:
 *
 * - The nonce is bumped by one atomic increment, so two concurrent rounds can
 *   never share a nonce (which would give them identical outcomes).
 * - A pair cannot be rotated — and so revealed — while a round that drew from
 *   it is still open. Revealing the seed mid-round would reveal the Mines board
 *   or the rest of the shoe.
 *
 * The byte → float mapping is the same as `src/lib/provablyFair.ts` (4 bytes per
 * float), which the in-browser verifier uses, so the two agree bit for bit.
 */

export interface RoundProof {
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
}

export interface FairnessView extends RoundProof {
  /** Seed pairs that have been rotated out and therefore revealed, newest first. */
  previous: Array<{
    serverSeed: string;
    serverSeedHash: string;
    clientSeed: string;
    /** How many rounds were played on the pair. */
    rounds: number;
    revealedAt: string;
  }>;
}

const sha256 = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");

/** Deterministic floats in [0,1) from a seed pair. Pure — also used by tests. */
export function floatsFromSeed(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  count: number,
): number[] {
  const floats: number[] = [];
  for (let cursor = 0; floats.length < count; cursor += 1) {
    const digest = createHmac("sha256", serverSeed).update(`${clientSeed}:${nonce}:${cursor}`).digest();
    for (let offset = 0; offset < 8 && floats.length < count; offset += 1) {
      const at = offset * 4;
      floats.push(
        digest[at]! / 256 +
          digest[at + 1]! / 256 ** 2 +
          digest[at + 2]! / 256 ** 3 +
          digest[at + 3]! / 256 ** 4,
      );
    }
  }
  return floats;
}

async function ensureActive(tx: Tx, userId: string) {
  const existing = await tx.fairnessSeed.findFirst({
    where: { userId, active: true },
    orderBy: { createdAt: "asc" },
  });
  if (existing) return existing;

  const serverSeed = randomBytes(32).toString("hex");
  return tx.fairnessSeed.create({
    data: {
      userId,
      serverSeed,
      serverSeedHash: sha256(serverSeed),
      clientSeed: randomBytes(8).toString("hex"),
    },
  });
}

/**
 * Draws `count` floats for one round and advances the nonce. Call inside the
 * transaction that opens the round, so a round that fails to open does not burn
 * a nonce and a round that opens always has exactly one.
 */
export async function drawFloats(
  tx: Tx,
  userId: string,
  count: number,
): Promise<{ floats: number[]; proof: RoundProof }> {
  const pair = await ensureActive(tx, userId);

  // `increment` is one atomic UPDATE: concurrent rounds get distinct nonces.
  const bumped = await tx.fairnessSeed.update({
    where: { id: pair.id },
    data: { nonce: { increment: 1 } },
    select: { nonce: true },
  });
  const nonce = bumped.nonce - 1;

  return {
    floats: floatsFromSeed(pair.serverSeed, pair.clientSeed, nonce, count),
    proof: { serverSeedHash: pair.serverSeedHash, clientSeed: pair.clientSeed, nonce },
  };
}

/** What the player may see: the commitment, never the live server seed. */
export async function fairnessView(userId: string): Promise<FairnessView> {
  const pair = await transact((tx) => ensureActive(tx, userId));
  const revealed = await prisma.fairnessSeed.findMany({
    where: { userId, active: false },
    orderBy: { revealedAt: "desc" },
    take: 10,
  });

  return {
    serverSeedHash: pair.serverSeedHash,
    clientSeed: pair.clientSeed,
    nonce: pair.nonce,
    previous: revealed.map((row) => ({
      serverSeed: row.serverSeed,
      serverSeedHash: row.serverSeedHash,
      clientSeed: row.clientSeed,
      rounds: row.nonce,
      revealedAt: (row.revealedAt ?? row.createdAt).toISOString(),
    })),
  };
}

export class RotationBlockedError extends Error {
  readonly messageKey = "casino.error.roundInProgress";
  constructor() {
    super("a round is still open on the current seed pair");
    this.name = "RotationBlockedError";
  }
}

/**
 * Retires the current pair (revealing its server seed) and starts a new one,
 * optionally with a client seed the player chose. Refused while any casino round
 * is open — see the module note.
 */
export async function rotateSeeds(userId: string, clientSeed?: string): Promise<FairnessView> {
  await transact(async (tx) => {
    const open = await tx.bet.count({ where: { userId, kind: "CASINO", status: "OPEN" } });
    if (open > 0) throw new RotationBlockedError();

    await tx.fairnessSeed.updateMany({
      where: { userId, active: true },
      data: { active: false, revealedAt: new Date() },
    });

    const serverSeed = randomBytes(32).toString("hex");
    await tx.fairnessSeed.create({
      data: {
        userId,
        serverSeed,
        serverSeedHash: sha256(serverSeed),
        clientSeed: clientSeed?.trim() || randomBytes(8).toString("hex"),
      },
    });
  });

  return fairnessView(userId);
}
