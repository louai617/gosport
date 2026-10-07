#!/usr/bin/env node
// Points prisma/schema.prisma at the database engine named by DATABASE_URL.
//
//   file:…                 → sqlite
//   postgres(ql)://…       → postgresql
//
// Run automatically before `prisma generate` / `migrate`. It rewrites exactly
// one line and is a no-op when the schema already matches, so it is safe to run
// in every build. Pass `--provider sqlite|postgresql` to override (used when
// generating the migration SQL for the engine you are not currently running).
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Minimal .env loader — Next loads these for the app, Node scripts do not. */
function loadEnvFiles() {
  for (const name of [".env.local", ".env"]) {
    const path = resolve(root, name);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (!match || line.trim().startsWith("#")) continue;
      const [, key, raw] = match;
      if (process.env[key] !== undefined) continue;
      process.env[key] = raw.replace(/^(["'])(.*)\1$/, "$2");
    }
  }
}

export function providerFor(url) {
  if (!url || url.startsWith("file:")) return "sqlite";
  if (/^postgres(ql)?:\/\//i.test(url)) return "postgresql";
  throw new Error(
    `DATABASE_URL must start with "file:" (SQLite, development) or "postgresql://" ` +
      `(PostgreSQL, production). Received scheme: ${url.split(":")[0]}:`,
  );
}

export function applyProvider(provider) {
  const schemaPath = resolve(root, "prisma/schema.prisma");
  const source = readFileSync(schemaPath, "utf8");
  const pattern = /(datasource db \{\s*provider\s*=\s*)"[a-z]+"/;
  if (!pattern.test(source)) throw new Error("datasource provider line not found in schema.prisma");
  const next = source.replace(pattern, `$1"${provider}"`);
  if (next !== source) writeFileSync(schemaPath, next);
  return next !== source;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  loadEnvFiles();
  const flag = process.argv.indexOf("--provider");
  const provider = flag > -1 ? process.argv[flag + 1] : providerFor(process.env.DATABASE_URL);
  const changed = applyProvider(provider);
  console.log(`prisma provider: ${provider}${changed ? " (schema updated)" : ""}`);
}
