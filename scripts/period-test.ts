// Period boundaries in the platform calendar. Run: npm run test:period
import assert from "node:assert/strict";
import { resolvePeriod, bucketStarts, bucketIndex } from "../src/lib/period";

const TZ = "Africa/Tunis"; // UTC+1, no DST
// 00:30 on 8 Oct in Tunis is still 7 Oct in UTC — the case a UTC-based "today" gets wrong.
const now = new Date("2026-10-07T23:30:00Z");

const today = resolvePeriod("today", {}, now, TZ);
assert.equal(today.from.toISOString(), "2026-10-07T23:00:00.000Z");
assert.equal(today.to.toISOString(), "2026-10-08T23:00:00.000Z");
assert.equal(today.bucket, "hour");
assert.equal(bucketStarts(today, TZ).length, 24);

const yesterday = resolvePeriod("yesterday", {}, now, TZ);
assert.equal(yesterday.to.getTime(), today.from.getTime(), "periods tile with no gap");

const last7 = resolvePeriod("last7", {}, now, TZ);
assert.equal(bucketStarts(last7, TZ).length, 7);
assert.equal(last7.to.getTime(), today.to.getTime());

const month = resolvePeriod("lastMonth", {}, now, TZ);
assert.equal(month.from.toISOString(), "2026-08-31T23:00:00.000Z");
assert.equal(month.to.toISOString(), "2026-09-30T23:00:00.000Z");
assert.equal(bucketStarts(month, TZ).length, 30);

const custom = resolvePeriod("custom", { from: "2026-09-01", to: "2026-09-03" }, now, TZ);
assert.equal(bucketStarts(custom, TZ).length, 3);
assert.equal(custom.toDay, "2026-09-03", "inclusive end date");

// a nonsense custom range degrades to the default instead of throwing
assert.equal(resolvePeriod("custom", { from: "2026-09-03", to: "2026-09-01" }, now, TZ).preset, "last7");

// instants land in the right bucket, including the boundaries
const starts = bucketStarts(last7, TZ);
assert.equal(bucketIndex(starts, last7.from), 0);
assert.equal(bucketIndex(starts, new Date(last7.to.getTime() - 1)), 6);

console.log("✓ period boundaries");
