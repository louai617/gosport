// The server's float derivation must match the browser verifier bit for bit.
// Run: npm run test:unit  (needs the react-server condition for `server-only`)
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { floatsFromSeed } from "../src/server/casino/fairness";
import { generateFloats, sha256Hex } from "../src/lib/provablyFair";
import { shuffleIndicesFromFloats } from "../src/lib/games/shuffle";
import { shuffleIndices } from "../src/lib/provablyFair";

const serverSeed = "a".repeat(64);
const clientSeed = "my-client-seed";

for (const nonce of [0, 1, 17, 4096]) {
  for (const count of [1, 5, 8, 9, 24, 208]) {
    const server = floatsFromSeed(serverSeed, clientSeed, nonce, count);
    const browser = await generateFloats({ serverSeed, clientSeed, nonce }, count);
    assert.deepEqual(server, browser, `floats differ for nonce=${nonce} count=${count}`);
  }
}

assert.equal(createHash("sha256").update(serverSeed).digest("hex"), await sha256Hex(serverSeed), "commitment hash differs");

for (const f of floatsFromSeed(serverSeed, clientSeed, 3, 500)) assert.ok(f >= 0 && f < 1, "float out of [0,1)");

// the Mines board: server permutation == browser permutation
const viaServer = shuffleIndicesFromFloats(25, floatsFromSeed(serverSeed, clientSeed, 9, 24));
const viaBrowser = await shuffleIndices({ serverSeed, clientSeed, nonce: 9 }, 25);
assert.deepEqual(viaServer, viaBrowser);
assert.deepEqual([...viaServer].sort((a, b) => a - b), Array.from({ length: 25 }, (_, i) => i), "not a permutation");

// different nonce → different stream (no two rounds share an outcome by construction)
assert.notDeepEqual(floatsFromSeed(serverSeed, clientSeed, 1, 4), floatsFromSeed(serverSeed, clientSeed, 2, 4));

console.log("✓ fairness: server and browser derive identical floats");
