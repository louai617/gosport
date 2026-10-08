/**
 * Wallet & payments.
 *
 * SportGo never touches card data. Every method below describes an integration
 * that must be performed by a PCI-DSS compliant provider using hosted fields or
 * a redirect flow. In demo mode the provider is a no-op simulator.
 */

export type PaymentMethodKind =
  | "manual"
  | "card"
  | "bank_transfer"
  | "mobile_money"
  | "e_wallet"
  | "voucher";

export type PaymentMethodStatus = "available" | "coming_soon" | "unavailable";

export interface PaymentMethod {
  id: string;
  kind: PaymentMethodKind;
  /** i18n key for the display name. */
  nameKey: string;
  descriptionKey: string;
  /** Lucide icon name resolved by the PaymentMethod component. */
  icon: string;
  status: PaymentMethodStatus;
  supportsDeposit: boolean;
  supportsWithdrawal: boolean;
  minAmount: number;
  maxAmount: number;
  /** i18n key describing settlement time, e.g. `wallet.instant`. */
  processingTimeKey: string;
  /** Provider that would handle it in production. `mock` today. */
  provider: string;
  /** Extra compliance steps required before this becomes available. */
  requiresKyc: boolean;
}

export type TransactionKind =
  | "deposit"
  | "withdrawal"
  | "bet"
  | "win"
  | "refund"
  | "bonus"
  | "admin_credit"
  | "admin_debit"
  | "adjustment"
  | "credit_transfer";

export type TransactionStatus = "pending" | "completed" | "failed" | "cancelled" | "reversed";

export interface Transaction {
  id: string;
  reference: string;
  userId: string;
  kind: TransactionKind;
  status: TransactionStatus;
  /** TND, signed: positive for credits, negative for debits. */
  amount: number;
  currency: string;
  balanceBefore: number;
  balanceAfter: number;
  /** i18n key + params when the entry is system-described; otherwise `description`. */
  descriptionKey?: string;
  params?: Record<string, string | number>;
  description: string | null;
  /** Receipt / external reference supplied with the entry. Visible to the player. */
  externalReference: string | null;
  /** Reference of the bet or round the entry belongs to. */
  betReference: string | null;
  createdAt: string;
  /** When a pending entry reached its final status. */
  completedAt: string | null;
  /** True while the platform runs on credits rather than real money. */
  simulated: boolean;
}

/**
 * What only an operator sees: who the entry belongs to, who caused it, and the
 * internal reason. The player-facing mapper never produces these fields.
 */
export interface AdminTransaction extends Transaction {
  username: string;
  createdByUsername: string | null;
  reason: string | null;
}

export interface Wallet {
  userId: string;
  currency: string;
  /** Available to wager or withdraw. */
  balance: number;
  /** Already deducted from `balance` and held: open stakes and pending withdrawals. */
  reserved: number;
  /** Withdrawable now. */
  withdrawable: number;
  bonusBalance: number;
  updatedAt: string;
  simulated: boolean;
}

/** Result shape returned by every payment-provider adapter. */
export interface PaymentIntentResult {
  ok: boolean;
  /** Provider-side id, or a simulated one in demo mode. */
  intentId: string;
  status: TransactionStatus;
  /** Where the user would be redirected by a real provider. */
  redirectUrl?: string;
  /** i18n key when `ok` is false. */
  errorKey?: string;
  simulated: boolean;
}
