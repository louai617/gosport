import "server-only";

import { PrismaClient, Prisma } from "@prisma/client";

/**
 * Prisma client — one instance per process.
 *
 * The same application code runs against two engines:
 *
 *   DATABASE_URL="file:./dev.db"       → SQLite  via the libsql driver adapter
 *   DATABASE_URL="postgresql://…"      → PostgreSQL via the `pg` driver adapter
 *
 * Prisma 7 takes the connection from a driver adapter handed to the client, so
 * choosing the engine is one `if` in this file and nothing else in the
 * application knows which engine it is on. (`scripts/prisma-provider.mjs` keeps
 * the generated client's provider in step with the URL.)
 *
 * The adapter packages are loaded with `require` inside the factory, not at the
 * top of the module: a PostgreSQL deployment never loads the libsql native
 * binding, and a local SQLite checkout never loads `pg`.
 */

const globalForPrisma = globalThis as typeof globalThis & {
  sportgoPrisma?: PrismaClient;
};

export type DatabaseEngine = "sqlite" | "postgresql";

export function databaseUrl(): string {
  const url = process.env.DATABASE_URL?.trim();

  if (!url) {
    if (process.env.VERCEL) {
      throw new Error(
        "DATABASE_URL is not set. Configure a PostgreSQL connection string in the Vercel " +
          "project's environment variables (see docs/DEPLOYMENT.md).",
      );
    }
    return "file:./dev.db";
  }
  return url;
}

export function databaseEngine(url = databaseUrl()): DatabaseEngine {
  if (url.startsWith("file:")) return "sqlite";
  if (/^postgres(ql)?:\/\//i.test(url)) return "postgresql";
  throw new Error('DATABASE_URL must start with "file:" or "postgresql://".');
}

function createClient(): PrismaClient {
  const url = databaseUrl();
  const engine = databaseEngine(url);

  if (engine === "sqlite") {
    // A SQLite file on a serverless filesystem is ephemeral and per-instance: it
    // would silently lose every account and balance. Refuse rather than "work".
    if (process.env.VERCEL) {
      throw new Error(
        "SQLite cannot be used on Vercel — the filesystem is read-only and ephemeral. " +
          "Point DATABASE_URL at PostgreSQL (see docs/DEPLOYMENT.md).",
      );
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PrismaLibSql } = require("@prisma/adapter-libsql") as typeof import("@prisma/adapter-libsql");
    return new PrismaClient({ adapter: new PrismaLibSql({ url }) });
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PrismaPg } = require("@prisma/adapter-pg") as typeof import("@prisma/adapter-pg");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
}

let instance: PrismaClient | undefined;

function getClient(): PrismaClient {
  if (instance) return instance;
  instance = globalForPrisma.sportgoPrisma ?? createClient();
  // The dev server re-evaluates modules on every hot reload; without stashing the
  // instance each reload would strand its own connection pool.
  if (process.env.NODE_ENV !== "production") globalForPrisma.sportgoPrisma = instance;
  return instance;
}

/**
 * A `PrismaClient` in every observable respect; the underlying client is built
 * on first property access, so importing this module (during `next build`, say)
 * never opens a connection.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = getClient();
    const value: unknown = Reflect.get(client, property);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

/** The client handed to the callback of an interactive `$transaction`. */
export type Tx = Prisma.TransactionClient;
export type DbClient = PrismaClient | Tx;

/** P2002 — a unique constraint was violated. */
export function isUniqueViolation(error: unknown, field?: string): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code !== "P2002") return false;
  if (!field) return true;
  const target = (error.meta as { target?: unknown } | undefined)?.target;
  const text = Array.isArray(target) ? target.join(",") : String(target ?? "");
  // The driver adapters report the target differently (column list vs index
  // name vs driver message), so match on the message as a fallback too.
  return text.includes(field) || error.message.includes(field);
}

/**
 * Runs `fn` in an interactive transaction.
 *
 * `maxWait` and `timeout` are generous because a serverless cold start plus a
 * Postgres round trip per statement can exceed Prisma's 5 s default.
 */
export function transact<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return prisma.$transaction(fn, { maxWait: 10_000, timeout: 20_000 });
}
