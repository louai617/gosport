import { existsSync } from "node:fs";

import { defineConfig } from "prisma/config";

/**
 * Prisma CLI configuration (Prisma 7 reads the connection string here, not from
 * schema.prisma, and no longer loads `.env` files itself).
 *
 * The engine is chosen by the scheme of DATABASE_URL, and so is the migrations
 * folder — SQL migrations are engine-specific, so SQLite and PostgreSQL each get
 * their own history. `scripts/prisma-provider.mjs` keeps the `provider` line in
 * schema.prisma in step with the same URL.
 */
for (const file of [".env.local", ".env"]) {
  if (existsSync(file)) process.loadEnvFile(file);
}

const url = process.env.DATABASE_URL?.trim() || "file:./dev.db";
const engine = url.startsWith("file:") ? "sqlite" : "postgresql";

// Migrations take advisory locks, which a transaction-mode pooler (Neon's
// "-pooler" host, Supabase's :6543, PgBouncer) does not support. Point DIRECT_URL
// at the database's direct connection and `migrate deploy` uses it, while the
// running app keeps using the pooled DATABASE_URL.
const migrationUrl = process.env.DIRECT_URL?.trim() || url;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: `prisma/migrations/${engine}`,
    seed: "tsx --conditions=react-server prisma/seed.ts",
  },
  datasource: { url: migrationUrl },
});
