// CSV quoting and formula-injection neutralisation. Run: npm run test:unit
import assert from "node:assert/strict";
import { csvCell, toCsv } from "../src/lib/csv";

assert.equal(csvCell("plain"), "plain");
assert.equal(csvCell("a,b"), '"a,b"');
assert.equal(csvCell('say "hi"'), '"say ""hi"""');
assert.equal(csvCell("two\nlines"), '"two\nlines"');
assert.equal(csvCell(null), "");
assert.equal(csvCell(-5), "-5", "a negative number is a number, not a formula");

// a display name that would execute in Excel / Sheets is defanged
for (const evil of ["=HYPERLINK(\"http://x\")", "+SUM(1,2)", "-2+3", "@cmd", "\tTAB", "\rCR"]) {
  assert.ok(csvCell(evil).replace(/^"/, "").startsWith("'"), `not neutralised: ${JSON.stringify(evil)}`);
}

const csv = toCsv(["name", "n"], [["=1+1", 1], ["ok", 2]]);
assert.ok(csv.startsWith("﻿"), "BOM for Excel");
assert.ok(csv.includes("'=1+1"));

console.log("✓ csv");
