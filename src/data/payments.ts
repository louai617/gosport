import type { PaymentMethod } from "@/types";

/**
 * Payment-method catalogue.
 *
 * Exactly one entry is `available`: payout through the operator. A withdrawal
 * request holds the player's funds and waits in the operator's queue, where a
 * person approves it and pays it out of band — no rail is integrated, and that
 * is stated on the method itself. Every other entry is `coming_soon` or
 * `unavailable` with provider `"mock"`: a method the user could select and
 * believe would work is exactly the misrepresentation this project must not make.
 *
 * Card networks appear as a *category* ("International card"), not as a
 * branded integration, because no acquiring relationship exists.
 */
export const PAYMENT_METHODS: PaymentMethod[] = [
  {
    id: "pm-operator-payout",
    kind: "manual",
    nameKey: "wallet.method.manual.name",
    descriptionKey: "wallet.method.manual.description",
    icon: "hand-coins",
    status: "available",
    supportsDeposit: false,
    supportsWithdrawal: true,
    minAmount: 1,
    maxAmount: 1_000_000,
    processingTimeKey: "wallet.processing.operator",
    provider: "operator",
    requiresKyc: false,
  },
  {
    id: "pm-bank-transfer",
    kind: "bank_transfer",
    nameKey: "wallet.method.bankTransfer.name",
    descriptionKey: "wallet.method.bankTransfer.description",
    icon: "landmark",
    status: "coming_soon",
    supportsDeposit: true,
    supportsWithdrawal: true,
    minAmount: 20,
    maxAmount: 5000,
    processingTimeKey: "wallet.processing.oneToThreeDays",
    provider: "mock",
    requiresKyc: true,
  },
  {
    id: "pm-postal-card",
    kind: "card",
    nameKey: "wallet.method.postalCard.name",
    descriptionKey: "wallet.method.postalCard.description",
    icon: "credit-card",
    status: "coming_soon",
    supportsDeposit: true,
    supportsWithdrawal: false,
    minAmount: 10,
    maxAmount: 1000,
    processingTimeKey: "wallet.processing.instant",
    provider: "mock",
    requiresKyc: false,
  },
  {
    id: "pm-international-card",
    kind: "card",
    nameKey: "wallet.method.internationalCard.name",
    descriptionKey: "wallet.method.internationalCard.description",
    icon: "credit-card",
    status: "unavailable",
    supportsDeposit: true,
    supportsWithdrawal: false,
    minAmount: 20,
    maxAmount: 3000,
    processingTimeKey: "wallet.processing.instant",
    provider: "mock",
    requiresKyc: true,
  },
  {
    id: "pm-mobile-money",
    kind: "mobile_money",
    nameKey: "wallet.method.mobileMoney.name",
    descriptionKey: "wallet.method.mobileMoney.description",
    icon: "smartphone",
    status: "coming_soon",
    supportsDeposit: true,
    supportsWithdrawal: true,
    minAmount: 5,
    maxAmount: 800,
    processingTimeKey: "wallet.processing.minutes",
    provider: "mock",
    requiresKyc: true,
  },
  {
    id: "pm-ewallet",
    kind: "e_wallet",
    nameKey: "wallet.method.eWallet.name",
    descriptionKey: "wallet.method.eWallet.description",
    icon: "wallet",
    status: "unavailable",
    supportsDeposit: true,
    supportsWithdrawal: true,
    minAmount: 10,
    maxAmount: 2000,
    processingTimeKey: "wallet.processing.instant",
    provider: "mock",
    requiresKyc: true,
  },
  {
    id: "pm-voucher",
    kind: "voucher",
    nameKey: "wallet.method.voucher.name",
    descriptionKey: "wallet.method.voucher.description",
    icon: "ticket",
    status: "coming_soon",
    supportsDeposit: true,
    supportsWithdrawal: false,
    minAmount: 5,
    maxAmount: 500,
    processingTimeKey: "wallet.processing.instant",
    provider: "mock",
    requiresKyc: false,
  },
];
