import type { Metadata } from "next";
import Link from "next/link";
import { Landmark } from "lucide-react";
import { getPaymentMethods } from "@/services/paymentService";
import { getT } from "@/i18n/server";
import { Alert } from "@/components/ui/Alert";
import { buttonStyles } from "@/components/ui/Button";
import { PaymentMethodCard } from "@/components/wallet/PaymentMethodCard";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("wallet.deposit.title") };
}

/**
 * There is no deposit form on purpose: no payment provider is connected, and a
 * form that cannot succeed only teaches players to distrust the page. Credit is
 * added by an operator, and appears in the history as a deposit.
 */
export default async function DepositPage() {
  const [t, methods] = await Promise.all([getT(), getPaymentMethods({ forDeposit: true })]);

  return (
    <div className="max-w-2xl space-y-6">
      <header>
        <h1 className="text-h1 text-ink">{t("wallet.deposit.title")}</h1>
        <p className="mt-1 text-small text-ink-muted">{t("wallet.deposit.description")}</p>
      </header>

      <Alert tone="info" title={t("wallet.deposit.operatorTitle")}>
        <span className="flex items-start gap-2">
          <Landmark size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
          {t("wallet.deposit.operatorNote")}
        </span>
      </Alert>

      <section aria-labelledby="soon">
        <h2 id="soon" className="mb-3 text-h3 text-ink">
          {t("wallet.deposit.comingSoon")}
        </h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {methods.map((method) => (
            <PaymentMethodCard key={method.id} method={method} />
          ))}
        </div>
      </section>

      <Link href="/account/transactions" className={buttonStyles({ variant: "secondary" })}>
        {t("wallet.history.title")}
      </Link>
    </div>
  );
}
