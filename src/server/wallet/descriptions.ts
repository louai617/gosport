import type { TransactionType } from "@prisma/client";

/**
 * Player-safe descriptions for ledger entries.
 *
 * What the player reads is generated from the entry's *type* — never from the
 * administrator's free-text reason, which is internal (it can name an
 * investigation or a dispute). The English `description` is stored for exports;
 * the i18n key travels in `metadata` so the UI can translate it.
 */
export interface LedgerDescription {
  description: string;
  descriptionKey: string;
  params?: Record<string, string | number>;
}

export function describeEntry(
  type: TransactionType,
  options: { betReference?: string | null; game?: string | null } = {},
): LedgerDescription {
  const params: Record<string, string | number> = {};
  if (options.betReference) params.reference = options.betReference;
  const withParams = Object.keys(params).length > 0 ? { params } : {};

  switch (type) {
    case "DEPOSIT":
      return { description: "Deposit", descriptionKey: "wallet.tx.deposit", ...withParams };
    case "WITHDRAWAL":
      return { description: "Withdrawal", descriptionKey: "wallet.tx.withdrawal", ...withParams };
    case "BET":
      return { description: "Bet placed", descriptionKey: "wallet.tx.bet", ...withParams };
    case "WIN":
      return { description: "Winnings", descriptionKey: "wallet.tx.win", ...withParams };
    case "REFUND":
      return { description: "Refund", descriptionKey: "wallet.tx.refund", ...withParams };
    case "BONUS":
      return { description: "Bonus", descriptionKey: "wallet.tx.bonus", ...withParams };
    case "ADMIN_CREDIT":
      return { description: "Account credit", descriptionKey: "wallet.tx.adminCredit" };
    case "ADMIN_DEBIT":
      return { description: "Account debit", descriptionKey: "wallet.tx.adminDebit" };
    case "ADJUSTMENT":
      return { description: "Account adjustment", descriptionKey: "wallet.tx.adjustment" };
  }
}
