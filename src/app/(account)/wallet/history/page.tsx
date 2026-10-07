import { redirect } from "next/navigation";

/** The wallet's history is the account transactions view; one table, one URL. */
export default function WalletHistoryPage() {
  redirect("/account/transactions");
}
