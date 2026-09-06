import { APP, JURISDICTION } from "@/config/app.config";
import { getDataset } from "@/data";
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
import { asArray, containsNormalised, paginate } from "./utils";

/**
 * Wallet, transaction history and the payment-provider seam.
 *
 * ── SPORTGO HOLDS NO PAYMENT CREDENTIALS ──────────────────────────────────
 * This module is an adapter boundary and nothing more. SportGo never receives,
 * transmits or stores card data: a PCI-DSS compliant provider owns the card
 * fields through hosted fields or a full redirect, and the only values that
 * cross this boundary are an amount, a method id and a provider-issued intent
 * id. No provider is integrated in this build, so deposits and withdrawals are
 * refused rather than simulated — a screen that says "deposit successful" is
 * the one thing a demo sportsbook must never show.
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

export async function getWallet(): Promise<Wallet> {
  return getDataset().wallet;
}

/* --------------------------------------------------------------- transactions */

export async function getTransactions(
  query: TransactionQuery = {},
): Promise<Paginated<Transaction>> {
  const kinds = asArray(query.kind);
  const statuses = asArray(query.status);
  const fromMs = query.fromIso ? Date.parse(query.fromIso) : undefined;
  const toMs = query.toIso ? Date.parse(query.toIso) : undefined;
  const search = query.search?.trim();

  const matched = getDataset().transactions.filter((transaction) => {
    if (kinds.length > 0 && !kinds.includes(transaction.kind)) return false;
    if (statuses.length > 0 && !statuses.includes(transaction.status)) return false;

    const createdMs = Date.parse(transaction.createdAt);
    if (fromMs !== undefined && createdMs < fromMs) return false;
    if (toMs !== undefined && createdMs > toMs) return false;

    return !search || containsNormalised(transaction.reference, search);
  });

  matched.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return paginate(matched, query.page, query.pageSize);
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
): string | null {
  if (!method) return "wallet.error.methodNotFound";
  if (method.status !== "available") return "wallet.error.methodUnavailable";

  const supported =
    direction === "deposit" ? method.supportsDeposit : method.supportsWithdrawal;
  if (!supported) return "wallet.error.methodUnavailable";

  if (method.requiresKyc && getDataset().demoUser.kycStatus !== "verified") {
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
 * Never succeeds in this build. The request is validated first so the player
 * sees the real reason when one applies, and is then handed to the adapter,
 * which refuses because no licensed provider is connected.
 */
export async function createDeposit(
  input: MoneyMovementInput,
): Promise<PaymentIntentResult> {
  const method = findMethod(input.methodId);
  const problem = validateMovement(method, input.amount, "deposit");
  if (problem) return refuse(problem);

  return getPaymentProvider().createDepositIntent({
    userId: getDataset().demoUser.id,
    methodId: input.methodId,
    amount: input.amount,
    currency: JURISDICTION.currency,
    returnUrl: `${APP.url}/wallet/deposit/return`,
    idempotencyKey: newIdempotencyKey(),
  });
}

/**
 * Never succeeds in this build. A licensed operator gates every payout on a
 * verified identity plus source-of-funds, sanctions and PEP screening before
 * reaching the provider; none of those checks exists here, which is precisely
 * why nothing may leave the sandbox ledger.
 */
export async function createWithdrawal(
  input: MoneyMovementInput,
): Promise<PaymentIntentResult> {
  const method = findMethod(input.methodId);
  const problem = validateMovement(method, input.amount, "withdrawal");
  if (problem) return refuse(problem);

  if (input.amount > getDataset().wallet.withdrawable) {
    return refuse("wallet.error.insufficientFunds");
  }

  return getPaymentProvider().createWithdrawalPayout({
    userId: getDataset().demoUser.id,
    methodId: input.methodId,
    amount: input.amount,
    currency: JURISDICTION.currency,
    idempotencyKey: newIdempotencyKey(),
  });
}
