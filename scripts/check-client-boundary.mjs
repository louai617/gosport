#!/usr/bin/env node
/**
 * Catches a failure the type system and the build both miss.
 *
 * A `"use client"` module may export components, which a server component can
 * render. It may NOT export a plain function that a server component *calls* —
 * React replaces those with a proxy that throws "attempted to call X from the
 * server" at request time.
 *
 * This typechecks. It builds. Every page here is dynamic, so `next build`
 * never renders one and never hits it. It then throws on every request. This
 * project shipped that bug twice (`parseListQuery`, `hasBoard`) before this
 * check existed.
 *
 * Heuristic: an import from a client module whose local name starts lowercase
 * is a value, not a component. Type-only imports are ignored — those are
 * erased and are safe.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if ([".ts", ".tsx"].includes(extname(full))) out.push(full);
  }
  return out;
}

const files = walk(SRC);
const isClient = new Map();
for (const file of files) {
  const head = readFileSync(file, "utf8").slice(0, 200);
  isClient.set(file, /^\s*["']use client["']/m.test(head));
}

/** Resolves `@/x` and `./x` to a file in `src`, trying the usual extensions. */
function resolveImport(fromFile, spec) {
  let base;
  if (spec.startsWith("@/")) base = join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(fromFile), spec);
  else return null;

  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
  ]) {
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      /* keep trying */
    }
  }
  return null;
}

const IMPORT = /import\s+(type\s+)?\{([^}]+)\}\s+from\s+["']([^"']+)["']/g;

const problems = [];

for (const file of files) {
  if (isClient.get(file)) continue; // client → client is fine

  const source = readFileSync(file, "utf8");

  for (const match of source.matchAll(IMPORT)) {
    const [, typeOnly, names, spec] = match;
    if (typeOnly) continue;

    const target = resolveImport(file, spec);
    if (!target || !isClient.get(target)) continue;

    for (const raw of names.split(",")) {
      const name = raw.trim();
      if (!name || name.startsWith("type ")) continue;

      const local = (name.split(/\s+as\s+/).pop() ?? name).trim();
      // Components are PascalCase by convention and are safe to render.
      if (!/^[a-z]/.test(local)) continue;

      problems.push({
        file: relative(ROOT, file),
        name: local,
        from: relative(ROOT, target),
      });
    }
  }
}

if (problems.length === 0) {
  console.log(`✓ no server module calls a value exported from a "use client" module`);
} else {
  console.error(`✗ ${problems.length} client/server boundary violation(s):\n`);
  for (const problem of problems) {
    console.error(`    ${problem.file}`);
    console.error(`      imports "${problem.name}" from ${problem.from} ("use client")`);
    console.error(`      → move it to a module without "use client", e.g. under src/lib/\n`);
  }
  process.exitCode = 1;
}
