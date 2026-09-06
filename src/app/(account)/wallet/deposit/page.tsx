import type { Metadata } from "next";
import { getPaymentMethods } from "@/services/paymentService";
import { getT } from "@/i18n/server";
import { MoneyForm } from "@/components/wallet/MoneyForm";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("wallet.deposit.title") };
}

export default async function DepositPage() {
  const [t, methods] = await Promise.all([
    getT(),
    getPaymentMethods({ forDeposit: true }),
  ]);

  return (
    <div className="max-w-2xl space-y-6">
      <header>
        <h1 className="text-h1 text-ink">{t("wallet.deposit.title")}</h1>
        <p className="mt-1 text-small text-ink-muted">{t("wallet.deposit.description")}</p>
      </header>

      <MoneyForm kind="deposit" methods={methods} />
    </div>
  );
}
