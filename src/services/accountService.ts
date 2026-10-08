import "server-only";

import type { CreateManagerInput, CreatePlayerInput } from "@/lib/adminValidation";
import { isUniqueViolation, prisma, transact } from "@/server/db";
import { AuthError, requirePermission } from "@/server/auth/guard";
import { generatePassword, generateUsername } from "@/server/auth/credentials";
import { createHasher } from "@/server/auth/password";
import { revokeAllSessions } from "@/server/auth/session";
import { audit } from "@/server/security/audit";
import { getSetting } from "@/server/settings/settingsService";
import { ensureWallet, LedgerError } from "@/server/wallet/ledger";
import { issueCreditTx, sellCreditTx } from "./creditService";
import { requireManagedAccount, type ManagedKind } from "./playerAdminService";

/**
 * Creating and re-keying accounts.
 *
 * There is no sign-up. A superadmin creates managers; a manager creates players
 * (a superadmin may also create a player, who then belongs to no manager). The
 * server **generates** the username (unless the operator picks one) and the
 * password, stores only the Argon2id hash, and returns the plaintext password in
 * this one response for the operator to hand over. It is never logged, audited
 * or readable again — losing it means resetting it.
 *
 * Every generated password is marked `mustChangePassword`: the operator who read
 * it out must not remain able to sign in as the account holder once they have
 * chosen their own.
 */

export interface IssuedCredentials {
  username: string;
  /** Shown once. Never persisted. */
  password: string;
}

export interface CreateAccountResult {
  ok: boolean;
  errorKey?: string;
  fieldErrors?: Record<string, string>;
  accountId?: string;
  credentials?: IssuedCredentials;
  /** Credit placed on the new account at creation, in TND. */
  creditedAmount?: number;
}

async function freshCredentials() {
  const [minLength, requireSymbol] = await Promise.all([
    getSetting("security.passwordMinLength"),
    getSetting("security.passwordRequireSymbol"),
  ]);
  return generatePassword({ minLength, symbol: requireSymbol });
}

async function pickUsername(requested: string | undefined, prefix: "p" | "m"): Promise<string | null> {
  if (requested) {
    const taken = await prisma.user.findUnique({ where: { username: requested }, select: { id: true } });
    return taken ? null : requested;
  }
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = generateUsername(prefix);
    const taken = await prisma.user.findUnique({ where: { username: candidate }, select: { id: true } });
    if (!taken) return candidate;
  }
  throw new Error("Could not find a free generated username");
}

async function createAccount(
  kind: ManagedKind,
  input: CreatePlayerInput | CreateManagerInput,
): Promise<CreateAccountResult> {
  const actor = await requirePermission(kind === "player" ? "players.create" : "managers.create");

  const initialCredit = input.initialCredit;
  // Credit at creation follows the same chain as credit afterwards: a manager
  // can fund the player they create; the superadmin can fund the manager. A
  // superadmin has no balance to fund a player from.
  if (initialCredit !== undefined) {
    const allowed =
      (kind === "player" && actor.role === "manager") || (kind === "manager" && actor.role === "superadmin");
    if (!allowed) {
      return { ok: false, errorKey: "credit.error.notAllowed", fieldErrors: { initialCredit: "credit.error.notAllowed" } };
    }
  }

  const username = await pickUsername(input.username, kind === "player" ? "p" : "m");
  if (!username) {
    return { ok: false, errorKey: "common.error.checkFields", fieldErrors: { username: "auth.validation.usernameTaken" } };
  }

  const password = await freshCredentials();
  const passwordHash = await createHasher().hash(password);

  try {
    const result = await transact(async (tx) => {
      const user = await tx.user.create({
        data: {
          username,
          passwordHash,
          role: kind === "player" ? "PLAYER" : "MANAGER",
          status: "ACTIVE",
          mustChangePassword: true,
          createdById: actor.id,
          profile: { create: { displayName: input.displayName ?? username } },
        },
      });
      await ensureWallet(tx, user.id);

      await audit({
        tx,
        action: kind === "player" ? "admin.player.created" : "admin.manager.created",
        actor,
        targetUserId: user.id,
        targetType: "user",
        targetId: user.id,
        description: `Created ${kind} ${user.username} with generated credentials`,
        metadata: { kind, generatedUsername: !input.username },
      });

      if (initialCredit !== undefined) {
        const min = await getSetting("wallet.minTransactionAmount", tx);
        const max =
          kind === "player" ? await getSetting("wallet.maxTransactionAmount", tx) : await getSetting("wallet.maxAdjustmentAmount", tx);
        if (initialCredit < min || initialCredit > max) {
          throw new AuthError("forbidden", initialCredit < min ? "wallet.validation.amountTooLow" : "wallet.validation.amountTooHigh");
        }
        if (kind === "player") await sellCreditTx(tx, actor, user, initialCredit, { key: input.idempotencyKey });
        else await issueCreditTx(tx, actor, user, initialCredit, { key: input.idempotencyKey });
      }
      return user;
    });

    return {
      ok: true,
      accountId: result.id,
      credentials: { username: result.username, password },
      creditedAmount: initialCredit,
    };
  } catch (error) {
    if (error instanceof LedgerError) {
      return {
        ok: false,
        errorKey: error.code === "insufficient_funds" ? "credit.error.insufficientBalance" : error.messageKey,
        fieldErrors: { initialCredit: error.code === "insufficient_funds" ? "credit.error.insufficientBalance" : error.messageKey },
      };
    }
    if (error instanceof AuthError) {
      return { ok: false, errorKey: error.messageKey, fieldErrors: { initialCredit: error.messageKey } };
    }
    if (isUniqueViolation(error, "username")) {
      return { ok: false, errorKey: "common.error.checkFields", fieldErrors: { username: "auth.validation.usernameTaken" } };
    }
    throw error;
  }
}

export const createPlayerAccount = (input: CreatePlayerInput) => createAccount("player", input);
export const createManagerAccount = (input: CreateManagerInput) => createAccount("manager", input);

/* ------------------------------------------------------------------- reset */

export interface ResetCredentialsResult {
  ok: boolean;
  errorKey?: string;
  credentials?: IssuedCredentials;
}

/**
 * Replaces an account's password with a freshly generated one. The old password
 * stops working at once (it is overwritten), every session of the account is
 * ended, any lock is cleared, and the holder must choose their own password at
 * the next sign-in.
 */
export async function resetCredentials(
  accountId: string,
  kind: ManagedKind,
): Promise<ResetCredentialsResult> {
  const actor = await requirePermission(kind === "player" ? "players.credentials" : "managers.update");
  const account = await requireManagedAccount(actor, accountId, kind);
  if (account.status === "CLOSED") return { ok: false, errorKey: "admin.players.error.invalidTransition" };

  const password = await freshCredentials();
  const passwordHash = await createHasher().hash(password);

  await transact(async (tx) => {
    await tx.user.update({
      where: { id: account.id },
      data: {
        passwordHash,
        mustChangePassword: true,
        failedLoginCount: 0,
        lockedUntil: null,
        // A PENDING account (from an older flow) is activated by receiving credentials.
        ...(account.status === "PENDING" ? { status: "ACTIVE" as const } : {}),
      },
    });
    await audit({
      tx,
      action: "admin.account.credentials_reset",
      actor,
      targetUserId: account.id,
      targetType: "user",
      targetId: account.id,
      description: `Generated a new password for ${kind} ${account.username}`,
    });
  });
  await revokeAllSessions(account.id, { reason: "credentials_reset" });

  return { ok: true, credentials: { username: account.username, password } };
}
