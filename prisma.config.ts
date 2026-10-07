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

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: `prisma/migrations/${engine}`,
    seed: "tsx --conditions=react-server prisma/seed.ts",
  },
  datasource: { url },
});
