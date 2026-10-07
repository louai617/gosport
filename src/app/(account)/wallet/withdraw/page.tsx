import type { Metadata } from "next";
import { getPaymentMethods } from "@/services/paymentService";
import { getT } from "@/i18n/server";
import { WithdrawForm } from "@/components/wallet/WithdrawForm";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("wallet.withdraw.title") };
}

export default async function WithdrawPage() {
  const [t, methods] = await Promise.all([
    getT(),
    getPaymentMethods({ forWithdrawal: true }),
  ]);

  // Only methods a player can actually use. A "coming soon" rail has no place in
  // a form that submits money.
  const available = methods.filter((method) => method.status === "available");

  return (
    <div className="max-w-2xl space-y-6">
      <header>
        <h1 className="text-h1 text-ink">{t("wallet.withdraw.title")}</h1>
        <p className="mt-1 text-small text-ink-muted">{t("wallet.withdraw.description")}</p>
      </header>

      <WithdrawForm methods={available} />
    </div>
  );
}
