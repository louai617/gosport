/**
 * Wallet & payments.
 *
 * SportGo never touches card data. Every method below describes an integration
 * that must be performed by a PCI-DSS compliant provider using hosted fields or
 * a redirect flow. In demo mode the provider is a no-op simulator.
 */

export type PaymentMethodKind =
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
  | "bet_stake"
  | "bet_payout"
  | "bonus"
  | "refund"
  | "adjustment";

export type TransactionStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled"
  | "reversed";

export interface Transaction {
  id: string;
  reference: string;
  userId: string;
  kind: TransactionKind;
  status: TransactionStatus;
  /** Positive for credits, negative for debits. */
  amount: number;
  currency: string;
  /** Wallet balance after this entry — sandbox ledger only. */
  balanceAfter: number;
  methodId?: string;
  descriptionKey: string;
  params?: Record<string, string | number>;
  createdAt: string;
  completedAt: string | null;
  /** Always true in this build. */
  simulated: boolean;
}

export interface Wallet {
  userId: string;
  currency: string;
  /** Sandbox balance. Not money. */
  balance: number;
  /** Held by open bets. */
  reserved: number;
  /** Withdrawable = balance - reserved - unmetBonusWagering. */
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
