/**
 * Seeds the initial administrator — and nothing else.
 *
 *   ADMIN_EMAIL=… ADMIN_PASSWORD=… npm run db:seed
 *
 * The credentials come from the environment and are never in source control. The
 * password is hashed with Argon2id before it is stored and is never printed.
 * The account is created with `mustChangePassword`, so the password in the
 * environment is only good for the first sign-in.
 *
 * Idempotent and non-destructive: if an account with that e-mail already exists
 * it is left exactly as it is — re-running the seed can never reset a password
 * or demote/promote anyone.
 *
 * There is deliberately no demo data. Players, balances and transactions only
 * ever come from the application.
 */
import { existsSync } from "node:fs";

for (const file of [".env.local", ".env"]) {
  if (existsSync(file)) process.loadEnvFile(file);
}

import { emailSchema, nameSchema, passwordSchema, usernameSchema } from "@/lib/validation";
import { prisma } from "@/server/db";
import { createHasher } from "@/server/auth/password";
import { audit } from "@/server/security/audit";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(
      `\n✗ ${name} is not set.\n` +
        "  The initial administrator's credentials come from the environment, never from source.\n" +
        "  Set ADMIN_EMAIL and ADMIN_PASSWORD (and optionally ADMIN_USERNAME) and run again.\n",
    );
    process.exit(1);
  }
  return value;
}

async function main() {
  const email = emailSchema.safeParse(required("ADMIN_EMAIL"));
  if (!email.success) {
    console.error(`✗ ADMIN_EMAIL is not a valid address (${email.error.issues[0]?.message}).`);
    process.exit(1);
  }

  const username = usernameSchema.safeParse(process.env.ADMIN_USERNAME?.trim() || "admin");
  // "admin" is reserved for *players* picking a handle; the seeded operator may hold it.
  const handle = process.env.ADMIN_USERNAME?.trim().toLowerCase() || "admin";
  if (!username.success && handle !== "admin") {
    console.error(`✗ ADMIN_USERNAME is not valid (${username.error.issues[0]?.message}).`);
    process.exit(1);
  }

  const password = passwordSchema.safeParse(required("ADMIN_PASSWORD"));
  if (!password.success) {
    console.error(
      `✗ ADMIN_PASSWORD does not meet the password policy (${password.error.issues[0]?.message}).`,
    );
    process.exit(1);
  }

  const existing = await prisma.user.findFirst({
    where: { OR: [{ email: email.data }, { username: handle }] },
    select: { id: true, role: true, email: true },
  });

  if (existing) {
    console.log(
      `• An account for ${existing.email} already exists (${existing.role.toLowerCase()}); ` +
        "nothing was changed. The seed never overwrites an existing account.",
    );
    return;
  }

  const display = nameSchema.parse("Administrator");
  const passwordHash = await createHasher().hash(password.data);

  const admin = await prisma.user.create({
    data: {
      username: handle,
      email: email.data,
      passwordHash,
      role: "ADMIN",
      status: "ACTIVE",
      mustChangePassword: true,
      emailVerifiedAt: new Date(),
      profile: {
        create: {
          displayName: display,
          firstName: "Platform",
          lastName: "Administrator",
          countryCode: process.env.NEXT_PUBLIC_JURISDICTION?.trim() || "TN",
          locale: process.env.NEXT_PUBLIC_DEFAULT_LOCALE?.trim() || "fr",
          kycStatus: "VERIFIED",
        },
      },
    },
    select: { id: true, email: true, username: true },
  });

  await audit({
    action: "admin.player.created",
    actor: null,
    targetUserId: admin.id,
    targetType: "user",
    targetId: admin.id,
    description: `Initial administrator ${admin.username} created by the seed script`,
    metadata: { source: "prisma/seed.ts" },
  });

  console.log(
    `✓ Administrator created: ${admin.email} (username "${admin.username}").\n` +
      "  Sign in at /login with ADMIN_PASSWORD — you will be asked to change it immediately.",
  );
}

main()
  .catch((error) => {
    console.error("✗ Seed failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
