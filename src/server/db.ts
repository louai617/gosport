/**
 * Prisma client — one instance per process, created on first use.
 *
 * ── SCHEMA-ONLY IN THIS BUILD ─────────────────────────────────────────────
 * SportGo currently serves every screen from the simulated provider in
 * `src/data`, reached through `src/services/**`. `prisma/schema.prisma` is the
 * deployment target, not the running data source: nothing in this build reads
 * or writes Postgres, and no database needs to exist for the app to run.
 * ──────────────────────────────────────────────────────────────────────────
 *
 * Importing this module is therefore free of side effects — no client is
 * constructed, no pool is allocated, no socket is opened. Prisma connects
 * lazily on the first query anyway; deferring construction as well means a
 * module that merely imports `prisma` cannot fail on an environment that has
 * no `DATABASE_URL` at all, which is every environment today.
 */

import { PrismaClient } from "@prisma/client";

/**
 * The dev server re-evaluates modules on every hot reload. Without stashing the
 * instance on `globalThis`, each reload would strand its own client and its own
 * connection pool until Postgres starts refusing new connections.
 */
const globalForPrisma = globalThis as typeof globalThis & {
  sportgoPrisma?: PrismaClient;
};

let instance: PrismaClient | undefined;

function getClient(): PrismaClient {
  if (instance) return instance;

  // Prisma 7 takes the connection from a driver adapter passed here, not from
  // the schema — so this is the line a real deployment changes, to
  // `new PrismaClient({ adapter: new PrismaPg({ connectionString: env.DATABASE_URL }) })`.
  // Until then it is unreachable: no code path in this build touches `prisma`.
  instance = globalForPrisma.sportgoPrisma ?? new PrismaClient();

  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.sportgoPrisma = instance;
  }

  return instance;
}

/**
 * A `PrismaClient` in every observable respect; the underlying client is built
 * on the first property access rather than at import.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = getClient();
    const value: unknown = Reflect.get(client, property);

    // `$transaction`, `$connect` and friends read `this`; bound to the real
    // client so they are never invoked against the empty proxy target. Model
    // delegates (`prisma.user`) are objects and pass through untouched.
    return typeof value === "function" ? value.bind(client) : value;
  },
});
