/**
 * Break-glass recovery for a superadmin who cannot sign in:
 *
 *   npm run admin:recovery-link -- <username>
 *
 * Prints a one-time password-reset link (valid 30 minutes, single use). Running
 * this requires access to the deployment's environment and database, which is
 * the trust boundary: whoever has that can already do anything. The link is
 * recorded in the audit log (never the token itself).
 *
 * Managers and players never need this: the superadmin (for a manager) or the
 * manager (for a player) generates a new password from the console. The superadmin
 * has nobody above them, so this is their recovery path.
 */
import { existsSync } from "node:fs";

for (const file of [".env.local", ".env"]) {
  if (existsSync(file)) process.loadEnvFile(file);
}

import { prisma, transact } from "@/server/db";
import { audit } from "@/server/security/audit";
import { issuePasswordToken, passwordLink } from "@/services/authService";

async function main() {
  const username = (process.argv[2] ?? "").trim().toLowerCase();
  if (!username) {
    console.error("Usage: npm run admin:recovery-link -- <superadmin username>");
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { username } });
  if (!user || user.role !== "SUPERADMIN") {
    // Same message either way: this script is not an account-existence oracle.
    console.error("No superadmin account matches that username.");
    process.exit(1);
  }

  const token = await transact(async (tx) => {
    const issued = await issuePasswordToken(tx, {
      userId: user.id,
      purpose: "PASSWORD_RESET",
      ttlMs: 30 * 60 * 1000,
    });
    await tx.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null },
    });
    await audit({
      tx,
      action: "admin.player.reset_link_created",
      actor: null,
      targetUserId: user.id,
      description: `Recovery link issued for superadmin ${user.username} via the command line`,
      metadata: { source: "scripts/admin-recovery-link.ts" },
    });
    return issued;
  });

  console.log(`\nOne-time recovery link (30 minutes, single use):\n\n  ${passwordLink(token)}\n`);
}

main()
  .catch((error) => {
    console.error("Failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
