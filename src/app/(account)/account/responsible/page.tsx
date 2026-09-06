import type { Metadata } from "next";
import Link from "next/link";
import { getResponsibleGamblingLimits } from "@/services/userService";
import { getT } from "@/i18n/server";
import { Alert } from "@/components/ui/Alert";
import { LimitControl } from "@/components/responsible/LimitControl";
import { BreakControls } from "@/components/responsible/BreakControls";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("account.responsible.title") };
}

const LIMIT_COPY: Record<string, { titleKey: string; descriptionKey: string }> = {
  deposit: { titleKey: "responsible.limits.deposit.title", descriptionKey: "responsible.limits.deposit.body" },
  stake: { titleKey: "responsible.limits.stake.title", descriptionKey: "responsible.limits.stake.body" },
  loss: { titleKey: "responsible.limits.loss.title", descriptionKey: "responsible.limits.loss.body" },
  session_duration: { titleKey: "responsible.limits.session.title", descriptionKey: "responsible.limits.session.body" },
  single_bet: { titleKey: "responsible.limits.singleBet.title", descriptionKey: "responsible.limits.singleBet.body" },
};

export default async function AccountResponsiblePage() {
  const [t, limits] = await Promise.all([getT(), getResponsibleGamblingLimits()]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-h1 text-ink">{t("account.responsible.title")}</h1>
        <p className="mt-1 text-small text-ink-muted">
          {t("account.responsible.description")}
        </p>
      </header>

      <Alert tone="warning" title={t("common.demo.badge")}>
        {t("responsible.demoNote")}
      </Alert>

      <div className="space-y-3">
        {limits.map((limit) => {
          const copy = LIMIT_COPY[limit.kind];
          if (!copy) return null;
          return (
            <LimitControl
              key={limit.id}
              limit={limit}
              titleKey={copy.titleKey}
              descriptionKey={copy.descriptionKey}
            />
          );
        })}
      </div>

      <BreakControls />

      <p className="text-small text-ink-muted">
        <Link
          href="/responsible-gambling"
          className="font-semibold text-primary underline-offset-2 hover:underline"
        >
          {t("responsible.title")}
        </Link>
      </p>
    </div>
  );
}
