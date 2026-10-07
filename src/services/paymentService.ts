import "server-only";

import { APP, JURISDICTION } from "@/config/app.config";
import { getDataset } from "@/data";
import { fromBig, toMillimes } from "@/lib/money";
import { isUniqueViolation, prisma, transact } from "@/server/db";
import { isDemo } from "@/server/env";
import { requireUser } from "@/server/auth/guard";
import { notifyAdmins } from "@/server/notifications/notify";
import { audit } from "@/server/security/audit";
import {
  listPlayerTransactions,
  type TransactionQueryInput,
} from "@/server/repositories/transactionRepository";
import { describeEntry } from "@/server/wallet/descriptions";
import { appendLedgerEntry, ensureWallet, LedgerError } from "@/server/wallet/ledger";
import { getSetting } from "@/server/settings/settingsService";
import type {
  Paginated,
  PaymentIntentResult,
  PaymentMethod,
  PaymentMethodStatus,
  Transaction,
  Wallet,
} from "@/types";
import type {
  DepositIntentInput,
  MoneyMovementInput,
  PaymentMethodQuery,
  TransactionQuery,
  WithdrawalIntentInput,
} from "./types";
import { asArray } from "./utils";

/**
 * The player's own wallet, ledger history and the payment-provider seam.
 *
 * ── WHERE MONEY COMES FROM ────────────────────────────────────────────────
 * No payment provider is integrated, so a *player cannot deposit* by
 * themselves: `createDeposit` is refused. Credit enters an account when an
 * operator records a deposit (or a bonus, or a correction) through the admin
 * console, which writes an immutable, audited ledger entry. A *withdrawal
 * request* is real: it holds the funds immediately and waits in the operator's
 * queue until someone approves or rejects it.
 *
 * Every function here derives the player from the session — there is no
 * `userId` parameter anywhere, so one player cannot name another's wallet.
 * ──────────────────────────────────────────────────────────────────────────
 */

/** Refusal returned when no licensed provider is reachable. */
const DEMO_NO_PROVIDER = "wallet.error.demoModeNoProvider";

/** Deposit-first ordering: what a player can act on now sits above the rest. */
const STATUS_RANK: Record<PaymentMethodStatus, number> = {
  available: 0,
  coming_soon: 1,
  unavailable: 2,
};

/**
 * Every failure path produces the same envelope, so a caller never has to tell
 * "refused" apart from "failed" — neither moved anything.
 */
function refuse(errorKey: string): PaymentIntentResult {
  return { ok: false, intentId: "demo", status: "failed", errorKey, simulated: true };
}

/* ----------------------------------------------------------- provider adapter */

/**
 * What a licensed provider must implement to replace the stub. Deliberately
 * narrow: SportGo asks for an intent, hands the player to the provider, and
 * learns the outcome from a signed webhook. It never sees an instrument.
 */
export interface PaymentProviderAdapter {
  readonly id: string;
  createDepositIntent(input: DepositIntentInput): Promise<PaymentIntentResult>;
  createWithdrawalPayout(input: WithdrawalIntentInput): Promise<PaymentIntentResult>;
  verifyWebhookSignature(rawBody: string, signature: string): Promise<boolean>;
}

/**
 * The only adapter in this build: it refuses everything. It exists to prove
 * the seam compiles and to make the absence of a provider explicit at runtime
 * rather than implicit in an unimplemented code path.
 */
export const mockProvider: PaymentProviderAdapter = {
  id: "mock",

  async createDepositIntent() {
    return refuse(DEMO_NO_PROVIDER);
  },

  async createWithdrawalPayout() {
    return refuse(DEMO_NO_PROVIDER);
  },

  /**
   * Always false. A signature check that passes without a shared secret is
   * worse than no check: it would accept anyone's forged "payment completed".
   */
  async verifyWebhookSignature() {
    return false;
  },
};

/**
 * Resolves the configured adapter.
 *
 * Reads `process.env` directly rather than `@/server/env`, which is server-only
 * and would poison any bundle this module reaches through the services barrel.
 * An unknown value throws instead of falling back to the mock: silently
 * substituting a refusing stub for the provider an operator thought they had
 * configured is exactly how a live deployment ends up losing player deposits.
 */
export function getPaymentProvider(): PaymentProviderAdapter {
  const configured = process.env.PAYMENT_PROVIDER ?? mockProvider.id;
  if (configured !== mockProvider.id) {
    throw new Error(
      `PAYMENT_PROVIDER="${configured}" has no adapter. Only "${mockProvider.id}" is ` +
        "implemented — add a PaymentProviderAdapter for the provider and clear the " +
        "licensed_payment_provider launch gate before pointing at it.",
    );
  }
  return mockProvider;
}

/* ----------------------------------------------------------- methods & wallet */

export async function getPaymentMethods(
  query: PaymentMethodQuery = {},
): Promise<PaymentMethod[]> {
  const matched = getDataset().paymentMethods.filter((method) => {
    if (query.forDeposit && !method.supportsDeposit) return false;
    if (query.forWithdrawal && !method.supportsWithdrawal) return false;
    return true;
  });

  // Stable sort keeps the feed's own order inside each status band.
  return matched.sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status]);
}

/** Open stakes and withdrawals awaiting approval — already deducted from the balance. */
export async function walletSnapshot(userId: string): Promise<Wallet> {
  const [wallet, openStakes, pendingWithdrawals] = await Promise.all([
    prisma.wallet.findUnique({ where: { userId } }),
    prisma.bet.aggregate({ where: { userId, status: "OPEN" }, _sum: { stake: true } }),
    prisma.transaction.aggregate({
      where: { userId, type: "WITHDRAWAL", status: "PENDING" },
      _sum: { amount: true },
    }),
  ]);

  const balance = fromBig(wallet?.balance) / 1000;
  const reserved =
    (fromBig(openStakes._sum.stake) + Math.abs(fromBig(pendingWithdrawals._sum.amount))) / 1000;

  return {
    userId,
    currency: wallet?.currency ?? JURISDICTION.currency,
    balance,
    reserved,
    withdrawable: balance,
    bonusBalance: 0,
    updatedAt: (wallet?.updatedAt ?? new Date()).toISOString(),
    simulated: isDemo,
  };
}

export async function getWallet(): Promise<Wallet> {
  const user = await requireUser();
  return walletSnapshot(user.id);
}

/* --------------------------------------------------------------- transactions */

export async function getTransactions(
  query: TransactionQuery = {},
): Promise<Paginated<Transaction>> {
  const user = await requireUser();

  const input: TransactionQueryInput = {
    userId: user.id,
    kinds: asArray(query.kind),
    statuses: asArray(query.status),
    from: query.fromIso ? new Date(query.fromIso) : undefined,
    to: query.toIso ? new Date(query.toIso) : undefined,
    search: query.search,
    page: query.page,
    pageSize: query.pageSize,
    sort: query.sort,
    direction: query.direction,
    minAmount: query.minAmount,
    maxAmount: query.maxAmount,
  };
  return listPlayerTransactions(input);
}

/* ------------------------------------------------------------- money movement */

/**
 * Everything that would reject a request before a provider is ever called:
 * the method has to exist, be open, accept this direction, clear the player's
 * verification state and sit inside its own amount band. Returns the i18n key
 * of the first problem, or `null` when the request is well formed.
 */
function validateMovement(
  method: PaymentMethod | undefined,
  amount: number,
  direction: "deposit" | "withdrawal",
  kycStatus: string = "not_started",
): string | null {
  if (!method) return "wallet.error.methodNotFound";
  if (method.status !== "available") return "wallet.error.methodUnavailable";

  const supported =
    direction === "deposit" ? method.supportsDeposit : method.supportsWithdrawal;
  if (!supported) return "wallet.error.methodUnavailable";

  if (method.requiresKyc && kycStatus !== "verified") {
    return "wallet.error.kycRequired";
  }

  if (!Number.isFinite(amount) || amount <= 0) return "wallet.validation.amountInvalid";
  if (amount < method.minAmount) return "wallet.validation.amountTooLow";
  if (amount > method.maxAmount) return "wallet.validation.amountTooHigh";

  return null;
}

/**
 * A retried request must never create a second movement, so the key is minted
 * once here and passed to the provider verbatim.
 */
function newIdempotencyKey(): string {
  return `sg-${crypto.randomUUID()}`;
}

function findMethod(methodId: string): PaymentMethod | undefined {
  return getDataset().paymentMethods.find((method) => method.id === methodId);
}

/**
 * Always refused: no payment provider is connected, and recording a deposit that
 * moved no real money would be the most misleading thing this platform could do.
 * Credit is added by an operator through the admin console.
 */
export async function createDeposit(
  input: MoneyMovementInput,
): Promise<PaymentIntentResult> {
  await requireUser();
  const method = findMethod(input.methodId);
  const problem = validateMovement(method, input.amount, "deposit");
  if (problem) return refuse(problem);

  return getPaymentProvider().createDepositIntent({
    userId: (await requireUser()).id,
    methodId: input.methodId,
    amount: input.amount,
    currency: JURISDICTION.currency,
    returnUrl: `${APP.url}/wallet/deposit/return`,
    idempotencyKey: input.idempotencyKey ?? newIdempotencyKey(),
  });
}

/**
 * Requests a payout.
 *
 * The funds are deducted at once and recorded as a PENDING `WITHDRAWAL` ledger
 * entry — holding them is what prevents the same credit being wagered and
 * withdrawn. An operator then approves it (the entry completes) or rejects it
 * (the entry is reversed and the funds are returned by a REFUND entry). Nothing
 * leaves the platform automatically: there is no payout provider.
 */
export async function createWithdrawal(
  input: MoneyMovementInput,
): Promise<PaymentIntentResult> {
  const user = await requireUser();
  const method = findMethod(input.methodId);

  const profile = await prisma.playerProfile.findUnique({
    where: { userId: user.id },
    select: { withdrawalsBlocked: true },
  });
  if (profile?.withdrawalsBlocked) return refuse("wallet.error.withdrawalsBlocked");
  if (user.status === "closed") return refuse("auth.error.accountClosed");
  if (await getSetting("general.maintenanceMode")) return refuse("auth.error.maintenance");

  const problem = validateMovement(method, input.amount, "withdrawal", user.kycStatus);
  if (problem) return refuse(problem);

  const [min, max] = await Promise.all([
    getSetting("wallet.minTransactionAmount"),
    getSetting("wallet.maxTransactionAmount"),
  ]);
  if (input.amount < min) return refuse("wallet.validation.amountTooLow");
  if (input.amount > max) return refuse("wallet.validation.amountTooHigh");

  const millimes = toMillimes(input.amount);
  const idempotencyKey = input.idempotencyKey ?? newIdempotencyKey();

  try {
    const result = await transact(async (tx) => {
      await ensureWallet(tx, user.id);
      const { entry, replayed } = await appendLedgerEntry(tx, {
        userId: user.id,
        type: "WITHDRAWAL",
        amount: -millimes,
        status: "PENDING",
        description: "Withdrawal request",
        idempotencyKey: `withdraw:${idempotencyKey}`,
        createdById: user.id,
        metadata: {
          descriptionKey: "wallet.tx.withdrawalRequest",
          methodId: input.methodId,
        },
      });

      if (!replayed) {
        await audit({
          tx,
          action: "wallet.withdrawal_requested",
          actor: user,
          targetUserId: user.id,
          targetType: "transaction",
          targetId: entry.id,
          transactionId: entry.id,
          description: `Withdrawal of ${input.amount.toFixed(3)} ${JURISDICTION.currency} requested`,
          metadata: { amountMillimes: millimes, methodId: input.methodId },
        });
        await notifyAdmins({
          tx,
          kind: "withdrawal_request",
          titleKey: "notify.withdrawalRequest.title",
          bodyKey: "notify.withdrawalRequest.body",
          params: { username: user.username, amount: input.amount.toFixed(2) },
          href: `/admin/transactions?status=pending&type=withdrawal`,
        });
      }
      return entry;
    });

    return {
      ok: true,
      intentId: result.reference,
      status: "pending",
      simulated: isDemo,
    };
  } catch (error) {
    if (error instanceof LedgerError) return refuse(error.messageKey);
    if (isUniqueViolation(error)) return refuse("common.error.unexpected");
    throw error;
  }
}
