import type { Metadata } from "next";
import { AlertTriangle, CircleCheck, LifeBuoy, ShieldCheck } from "lucide-react";
import { RESPONSIBLE_GAMBLING, SUPPORT, compliance } from "@/config/app.config";
import { getResponsibleGamblingLimits } from "@/services/userService";
import { getT } from "@/i18n/server";
import { Alert } from "@/components/ui/Alert";
import { LimitControl } from "@/components/responsible/LimitControl";
import { BreakControls } from "@/components/responsible/BreakControls";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("responsible.title") };
}

const LIMIT_COPY: Record<string, { titleKey: string; descriptionKey: string }> = {
  deposit: {
    titleKey: "responsible.limits.deposit.title",
    descriptionKey: "responsible.limits.deposit.body",
  },
  stake: {
    titleKey: "responsible.limits.stake.title",
    descriptionKey: "responsible.limits.stake.body",
  },
  loss: {
    titleKey: "responsible.limits.loss.title",
    descriptionKey: "responsible.limits.loss.body",
  },
  session_duration: {
    titleKey: "responsible.limits.session.title",
    descriptionKey: "responsible.limits.session.body",
  },
  single_bet: {
    titleKey: "responsible.limits.singleBet.title",
    descriptionKey: "responsible.limits.singleBet.body",
  },
};

const WARNING_SIGNS = [1, 2, 3, 4, 5, 6] as const;

export default async function ResponsibleGamblingPage() {
  const [t, limits] = await Promise.all([getT(), getResponsibleGamblingLimits()]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <header>
        <p className="flex items-center gap-2 text-caption uppercase text-primary">
          <ShieldCheck size={14} aria-hidden="true" />
          {t("footer.responsibleGambling")}
        </p>
        <h1 className="mt-2 text-display text-ink">{t("responsible.title")}</h1>
        <p className="mt-2 max-w-prose text-body leading-relaxed text-ink-muted">
          {t("responsible.subtitle")}
        </p>
      </header>

      <Alert tone="warning" className="mt-6" title={t("common.demo.badge")}>
        {t("responsible.demoNote")}
      </Alert>

      {/* ------------------------------------------------------------- 18+ -- */}
      <section aria-labelledby="age-heading" className="mt-8">
        <div className="flex gap-4 rounded-xl border border-line bg-surface p-5">
          <span
            aria-hidden="true"
            className="numeric grid size-12 shrink-0 place-items-center rounded-full border-2 border-danger text-h3 font-bold text-danger"
          >
            18+
          </span>
          <div>
            <h2 id="age-heading" className="text-h2 text-ink">
              {t("responsible.age.title")}
            </h2>
            <p className="mt-1.5 max-w-prose text-small leading-relaxed text-ink-muted">
              {t("responsible.age.body")}
            </p>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ risk -- */}
      <section aria-labelledby="risk-heading" className="mt-8">
        <h2 id="risk-heading" className="text-h2 text-ink">
          {t("responsible.risk.title")}
        </h2>
        <p className="mt-1.5 max-w-prose text-small leading-relaxed text-ink-muted">
          {t("responsible.risk.body")}
        </p>

        <h3 className="mt-5 text-h3 text-ink">{t("responsible.risk.signs.title")}</h3>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {WARNING_SIGNS.map((index) => (
            <li
              key={index}
              className="flex items-start gap-2.5 rounded-lg border border-line bg-surface p-3"
            >
              <AlertTriangle
                size={15}
                aria-hidden="true"
                className="mt-0.5 shrink-0 text-warning"
              />
              <span className="text-small leading-relaxed text-ink-muted">
                {t(`responsible.risk.signs.${index}`)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* ----------------------------------------------------------- tools -- */}
      <section aria-labelledby="tools-heading" className="mt-10">
        <h2 id="tools-heading" className="text-h2 text-ink">
          {t("responsible.tools.title")}
        </h2>
        <p className="mt-1.5 max-w-prose text-small leading-relaxed text-ink-muted">
          {t("responsible.tools.intro")}
        </p>

        <div className="mt-4 space-y-3">
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

        <div className="mt-4">
          <BreakControls />
        </div>
      </section>

      {/* --------------------------------------------------- reality check -- */}
      <section aria-labelledby="reality-heading" className="mt-10">
        <div className="rounded-xl border border-line bg-surface p-5">
          <h2 id="reality-heading" className="text-h3 text-ink">
            {t("responsible.realityCheck.title")}
          </h2>
          <p className="mt-1.5 max-w-prose text-small leading-relaxed text-ink-muted">
            {t("responsible.realityCheck.body", {
              minutes: RESPONSIBLE_GAMBLING.realityCheckMinutes,
            })}
          </p>
        </div>
      </section>

      {/* --------------------------------------------------------- support -- */}
      <section aria-labelledby="support-heading" className="mt-10">
        <div className="rounded-xl border border-primary/25 bg-primary-soft/40 p-5">
          <h2
            id="support-heading"
            className="flex items-center gap-2 text-h2 text-ink"
          >
            <LifeBuoy size={18} aria-hidden="true" className="text-primary" />
            {t("responsible.support.title")}
          </h2>
          <p className="mt-1.5 max-w-prose text-small leading-relaxed text-ink-muted">
            {t("responsible.support.body")}
          </p>

          {/* No helpline number is invented here. */}
          <p className="mt-3 rounded-lg border border-line bg-surface p-3 text-small leading-relaxed text-ink-muted">
            {t("responsible.helplinePlaceholder")}
          </p>

          <p className="mt-3 text-small text-ink-muted">
            {t("responsible.support.talkToSomeone")}{" "}
            <a
              href={`mailto:${SUPPORT.email}`}
              className="font-semibold text-primary underline-offset-2 hover:underline"
            >
              {SUPPORT.email}
            </a>
          </p>
        </div>
      </section>

      {/* --------------------------------------------------- launch gates -- */}
      <section aria-labelledby="gates-heading" className="mt-10">
        <h2 id="gates-heading" className="text-h2 text-ink">
          {t("responsible.launchGate.title")}
        </h2>
        <p className="mt-1.5 max-w-prose text-small leading-relaxed text-ink-muted">
          {t("responsible.launchGate.body")}
        </p>

        {/* Rendered from `compliance.requiredBeforeLaunch` so this list and the
            configuration cannot drift apart. */}
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {compliance.requiredBeforeLaunch.map((gate) => (
            <li
              key={gate}
              className="flex items-start gap-2.5 rounded-lg border border-line bg-surface p-3"
            >
              <CircleCheck
                size={15}
                aria-hidden="true"
                className="mt-0.5 shrink-0 text-ink-subtle"
              />
              <span className="text-small leading-relaxed text-ink-muted">
                {t(`responsible.launchGate.${gate}`)}
              </span>
            </li>
          ))}
        </ul>

        <p className="mt-4 text-small leading-relaxed text-ink-muted">
          {t("common.legal.noLicence")}
        </p>
      </section>
    </div>
  );
}
