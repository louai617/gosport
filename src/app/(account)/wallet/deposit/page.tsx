import type { Metadata } from "next";
import Link from "next/link";
import { Landmark } from "lucide-react";
import { getPaymentMethods } from "@/services/paymentService";
import { getOwnManager, listOwnCreditRequests } from "@/services/creditRequestService";
import { formatAmount, formatDateTime } from "@/lib/format";
import { getRequestLocale, getT } from "@/i18n/server";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { buttonStyles } from "@/components/ui/Button";
import { CancelCreditRequest } from "@/components/wallet/CancelCreditRequest";
import { CreditRequestForm } from "@/components/wallet/CreditRequestForm";
import { PaymentMethodCard } from "@/components/wallet/PaymentMethodCard";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("wallet.deposit.title") };
}

/**
 * There is no payment form on purpose: no payment provider is connected, and a
 * form that cannot succeed only teaches players to distrust the page. Credit
 * comes from the player's manager — the player asks here, the manager approves
 * (which sells the credit from the manager's own balance) and it appears in the
 * history as a deposit.
 */
export default async function DepositPage() {
  const [t, locale, methods, manager, requests] = await Promise.all([
    getT(),
    getRequestLocale(),
    getPaymentMethods({ forDeposit: true }),
    getOwnManager(),
    listOwnCreditRequests(),
  ]);

  const tone = { pending: "warning", approved: "success", rejected: "danger", cancelled: "neutral" } as const;

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

      <section aria-labelledby="ask" className="rounded-xl border border-line bg-surface p-5">
        <h2 id="ask" className="text-h3 text-ink">{t("wallet.creditRequest.title")}</h2>
        {manager ? (
          <>
            <p className="mb-4 mt-1 text-small text-ink-muted">
              {t("wallet.creditRequest.body", { manager: manager.displayName })}
            </p>
            <CreditRequestForm manager={manager.displayName} />
          </>
        ) : (
          <p className="mt-1 text-small text-ink-muted">{t("wallet.creditRequest.noManager")}</p>
        )}
      </section>

      {requests.length > 0 ? (
        <section aria-labelledby="mine" className="space-y-2">
          <h2 id="mine" className="text-h3 text-ink">{t("wallet.creditRequest.history")}</h2>
          <ul className="divide-y divide-line-soft overflow-hidden rounded-xl border border-line bg-surface">
            {requests.map((request) => (
              <li key={request.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="numeric text-small font-semibold text-ink">
                    {formatAmount(request.amount, locale)}
                    <Badge tone={tone[request.status]} className="ms-2">
                      {t(`wallet.creditRequest.status.${request.status}`)}
                    </Badge>
                  </p>
                  <p className="text-caption normal-case tracking-normal text-ink-subtle">
                    {formatDateTime(request.createdAt, locale)}
                    {request.note ? ` · ${request.note}` : ""}
                    {request.decisionNote ? ` · ${request.decisionNote}` : ""}
                  </p>
                </div>
                {request.status === "pending" ? <CancelCreditRequest id={request.id} /> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

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
