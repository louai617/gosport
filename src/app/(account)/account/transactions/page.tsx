import type { Metadata } from "next";
import { getTransactions } from "@/services/paymentService";
import { getT } from "@/i18n/server";
import { TransactionTable } from "@/components/wallet/TransactionTable";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("account.transactions.title") };
}

export default async function TransactionsPage() {
  const [t, transactions] = await Promise.all([
    getT(),
    getTransactions({ pageSize: 100 }),
  ]);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-h1 text-ink">{t("account.transactions.title")}</h1>
        <p className="mt-1 text-small text-ink-muted">
          {t("account.transactions.description")}
        </p>
      </header>

      <TransactionTable transactions={transactions} />
    </div>
  );
}
