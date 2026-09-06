#!/usr/bin/env node
/**
 * Translation audit.
 *
 * Two checks, both of which have caught real bugs in this codebase:
 *
 *  1. Every literal `t("…")` key in `src/` exists in the merged dictionary.
 *     A missing key renders as a raw dotted path in production.
 *  2. Every locale carries the same key set and the same `{placeholders}`
 *     per key. A translator dropping `{count}` silently breaks a sentence.
 *
 * Dynamic keys (`t(sport.nameKey)`, `t("status." + s)`) cannot be resolved
 * statically and are reported separately so they can be eyeballed.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const LOCALES = ["en", "fr", "ar"];
const NAMESPACES = [
  "common", "home", "sportsbook", "betting", "auth",
  "account", "wallet", "promotions", "responsible", "legal", "games", "admin",
];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if ([".ts", ".tsx"].includes(extname(full))) out.push(full);
  }
  return out;
}

function loadDictionary(locale) {
  const merged = {};
  for (const ns of NAMESPACES) {
    const path = `locales/${locale}/${ns}.json`;
    try {
      Object.assign(merged, JSON.parse(readFileSync(path, "utf8")));
    } catch (error) {
      console.error(`  ✗ ${path}: ${error.message}`);
      process.exitCode = 1;
    }
  }
  return merged;
}

const dictionaries = Object.fromEntries(
  LOCALES.map((locale) => [locale, loadDictionary(locale)]),
);

/* ---------------------------------------------------- 1. key set parity --- */

const base = dictionaries.en;
const baseKeys = Object.keys(base).sort();
let parityFailures = 0;

const PLACEHOLDER = /\{(\w+)\}/g;
const placeholdersOf = (value) =>
  [...String(value).matchAll(PLACEHOLDER)].map((match) => match[1]).sort().join(",");

for (const locale of LOCALES.filter((l) => l !== "en")) {
  const keys = Object.keys(dictionaries[locale]).sort();

  const missing = baseKeys.filter((key) => !(key in dictionaries[locale]));
  const extra = keys.filter((key) => !(key in base));

  for (const key of missing) {
    console.error(`  ✗ ${locale}: missing key "${key}"`);
    parityFailures += 1;
  }
  for (const key of extra) {
    console.error(`  ✗ ${locale}: key "${key}" not present in en`);
    parityFailures += 1;
  }

  for (const key of baseKeys) {
    if (!(key in dictionaries[locale])) continue;
    const expected = placeholdersOf(base[key]);
    const actual = placeholdersOf(dictionaries[locale][key]);
    if (expected !== actual) {
      console.error(
        `  ✗ ${locale}: "${key}" placeholders differ — en {${expected}} vs ${locale} {${actual}}`,
      );
      parityFailures += 1;
    }
  }
}

/* ------------------------------------------------------ 2. usage audit --- */

const LITERAL = /\bt\(\s*["'`]([\w.\-]+)["'`]/g;
const DYNAMIC = /\bt\(\s*(?!["'`])([^),]{1,60})/g;

const used = new Set();
const dynamic = new Map();

for (const file of walk("src")) {
  const source = readFileSync(file, "utf8");

  for (const match of source.matchAll(LITERAL)) used.add(match[1]);

  for (const match of source.matchAll(DYNAMIC)) {
    const expression = match[1].trim();
    if (!expression || expression.startsWith("//")) continue;
    if (!dynamic.has(expression)) dynamic.set(expression, file);
  }
}

const missingUsed = [...used].filter((key) => !(key in base)).sort();

/* ------------------------------------------------------------- report --- */

console.log(`\nDictionary: ${baseKeys.length} keys × ${LOCALES.length} locales`);
console.log(`Literal keys used in src: ${used.size}`);

if (missingUsed.length > 0) {
  console.error(`\n✗ ${missingUsed.length} key(s) used in code but not translated:`);
  for (const key of missingUsed) console.error(`    ${key}`);
  process.exitCode = 1;
} else {
  console.log("✓ every literal key used in code exists in the dictionary");
}

if (parityFailures === 0) {
  console.log("✓ all locales share one key set and identical placeholders");
} else {
  console.error(`\n✗ ${parityFailures} locale parity problem(s)`);
  process.exitCode = 1;
}

if (dynamic.size > 0 && process.argv.includes("--verbose")) {
  console.log(`\nDynamic keys (verify by hand): ${dynamic.size}`);
  for (const [expression, file] of dynamic) {
    console.log(`    ${expression}  ← ${file}`);
  }
}
