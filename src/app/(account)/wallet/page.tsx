import type { Metadata } from "next";
import { getPaymentMethods, getTransactions, getWallet } from "@/services/paymentService";
import { getT } from "@/i18n/server";
import { BalanceCard } from "@/components/account/BalanceCard";
import { PaymentMethodCard } from "@/components/wallet/PaymentMethodCard";
import { TransactionTable } from "@/components/wallet/TransactionTable";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("wallet.title") };
}

export default async function WalletPage() {
  const [t, wallet, methods, transactions] = await Promise.all([
    getT(),
    getWallet(),
    getPaymentMethods(),
    getTransactions({ pageSize: 10 }),
  ]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-h1 text-ink">{t("wallet.title")}</h1>
        <p className="mt-1 max-w-prose text-small text-ink-muted">
          {t("wallet.description")}
        </p>
      </header>

      <BalanceCard wallet={wallet} />

      <section aria-labelledby="methods-heading">
        <h2 id="methods-heading" className="mb-3 text-h2 text-ink">
          {t("wallet.methods")}
        </h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {methods.map((method) => (
            <PaymentMethodCard key={method.id} method={method} />
          ))}
        </div>
        <p className="mt-3 max-w-prose text-caption normal-case leading-relaxed tracking-normal text-ink-subtle">
          {t("wallet.providerNotice")}
        </p>
      </section>

      <section aria-labelledby="history-heading">
        <h2 id="history-heading" className="mb-3 text-h2 text-ink">
          {t("wallet.history.title")}
        </h2>
        <TransactionTable transactions={transactions} compact />
      </section>
    </div>
  );
}
