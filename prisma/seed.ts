/**
 * Seeds the initial superadmin — and nothing else.
 *
 *   ADMIN_USERNAME=… ADMIN_PASSWORD=… npm run db:seed
 *
 * The credentials come from the environment and are never in source control. The
 * password is hashed with Argon2id before it is stored and is never printed.
 * The account is created with `mustChangePassword`, so the password in the
 * environment is only good for the first sign-in. From there the superadmin
 * creates managers, and managers create players — there is no sign-up.
 *
 * Idempotent and non-destructive: if an account with that username already
 * exists it is left exactly as it is — re-running the seed can never reset a
 * password or demote/promote anyone.
 *
 * There is deliberately no demo data. Managers, players, balances and
 * transactions only ever come from the application.
 */
import { existsSync } from "node:fs";

for (const file of [".env.local", ".env"]) {
  if (existsSync(file)) process.loadEnvFile(file);
}

import { passwordSchema, usernameSchema } from "@/lib/validation";
import { prisma } from "@/server/db";
import { createHasher } from "@/server/auth/password";
import { audit } from "@/server/security/audit";
import { ensureWallet } from "@/server/wallet/ledger";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(
      `\n✗ ${name} is not set.\n` +
        "  The superadmin's credentials come from the environment, never from source.\n" +
        "  Set ADMIN_USERNAME and ADMIN_PASSWORD and run again.\n",
    );
    process.exit(1);
  }
  return value;
}

async function main() {
  const handle = required("ADMIN_USERNAME").toLowerCase();
  // Reserved handles ("admin", …) exist to stop *others* passing for staff; the
  // seeded superadmin may hold one.
  const username = usernameSchema.safeParse(handle);
  if (!username.success && !/^[a-z0-9](?:[a-z0-9._-]{1,22}[a-z0-9])$/.test(handle)) {
    console.error(`✗ ADMIN_USERNAME is not valid (${username.error?.issues[0]?.message}).`);
    process.exit(1);
  }

  const password = passwordSchema.safeParse(required("ADMIN_PASSWORD"));
  if (!password.success) {
    console.error(
      `✗ ADMIN_PASSWORD does not meet the password policy (${password.error.issues[0]?.message}).`,
    );
    process.exit(1);
  }

  const existing = await prisma.user.findUnique({
    where: { username: handle },
    select: { id: true, role: true, username: true },
  });

  if (existing) {
    console.log(
      `• An account "${existing.username}" already exists (${existing.role.toLowerCase()}); ` +
        "nothing was changed. The seed never overwrites an existing account.",
    );
    return;
  }

  const passwordHash = await createHasher().hash(password.data);

  const admin = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        username: handle,
        passwordHash,
        role: "SUPERADMIN",
        status: "ACTIVE",
        mustChangePassword: true,
        profile: {
          create: {
            displayName: "Superadmin",
            countryCode: process.env.NEXT_PUBLIC_JURISDICTION?.trim() || "TN",
            locale: process.env.NEXT_PUBLIC_DEFAULT_LOCALE?.trim() || "fr",
            kycStatus: "VERIFIED",
          },
        },
      },
      select: { id: true, username: true },
    });
    await ensureWallet(tx, created.id);
    return created;
  });

  await audit({
    action: "admin.manager.created",
    actor: null,
    targetUserId: admin.id,
    targetType: "user",
    targetId: admin.id,
    description: `Initial superadmin ${admin.username} created by the seed script`,
    metadata: { source: "prisma/seed.ts" },
  });

  console.log(
    `✓ Superadmin created: "${admin.username}".\n` +
      "  Sign in at /login with ADMIN_PASSWORD — you will be asked to change it immediately.",
  );
}

main()
  .catch((error) => {
    console.error("✗ Seed failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
