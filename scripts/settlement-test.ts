// Exercises the pure settlement rules. Run: npm run test:settlement
import assert from "node:assert/strict";
import { settleTicket } from "../src/lib/settlement";

const W = (oddsMilli: number) => ({ oddsMilli, result: "WON" as const });
const L = (oddsMilli: number) => ({ oddsMilli, result: "LOST" as const });
const V = (oddsMilli: number) => ({ oddsMilli, result: "VOID" as const });

// single
assert.deepEqual(settleTicket("single", 10_000, [W(2000)]), { payoutMillimes: 20_000, status: "WON", totalStakeMillimes: 10_000, lines: 1 });
assert.equal(settleTicket("single", 10_000, [L(2000)]).status, "LOST");
assert.deepEqual(settleTicket("single", 10_000, [V(2000)]), { payoutMillimes: 10_000, status: "VOID", totalStakeMillimes: 10_000, lines: 1 });

// multiple: price is the product, a lost leg kills it, a void leg counts as 1.00
assert.equal(settleTicket("multiple", 10_000, [W(2000), W(1500)]).payoutMillimes, 30_000);
assert.equal(settleTicket("multiple", 10_000, [W(2000), L(1500)]).payoutMillimes, 0);
assert.equal(settleTicket("multiple", 10_000, [W(2000), V(1500)]).payoutMillimes, 20_000);
assert.equal(settleTicket("multiple", 10_000, [V(2000), V(1500)]).status, "VOID");

// system 2-of-3 at 10.000 per line → 3 lines, total stake 30.000
const sys = settleTicket("system", 30_000, [W(2000), W(1500), L(1800)], 2);
assert.equal(sys.lines, 3);
assert.equal(sys.totalStakeMillimes, 30_000);
assert.equal(sys.payoutMillimes, 30_000); // only the W×W line pays: 10.000 × 2.0 × 1.5
assert.equal(sys.status, "WON");
assert.equal(settleTicket("system", 30_000, [L(2000), L(1500), L(1800)], 2).status, "LOST");

// rounding is to the millime, never fractional
assert.ok(Number.isInteger(settleTicket("multiple", 3_333, [W(1337), W(1913)]).payoutMillimes));

// invalid shapes are rejected, not guessed at
assert.throws(() => settleTicket("single", 1000, [W(2000), W(2000)]));
assert.throws(() => settleTicket("system", 1000, [W(2000), W(1500), W(1800)], 3));
assert.throws(() => settleTicket("system", 1000, [W(2000), W(1500), W(1800)], 2)); // 1000 / 3 lines is not whole

console.log("✓ settlement rules");
