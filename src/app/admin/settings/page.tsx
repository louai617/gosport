import type { Metadata } from "next";
import {
  APP,
  BETTING_RULES,
  JURISDICTION,
  RESPONSIBLE_GAMBLING,
  compliance,
} from "@/config/app.config";
import { LOCALES } from "@/i18n/config";
import { getAdminT } from "@/i18n/server";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";

export const metadata: Metadata = { title: "Settings" };

/**
 * System settings, rendered from the configuration module rather than typed
 * out again — so this page cannot claim a legal age or a currency the app is
 * not actually using.
 */
export default async function AdminSettingsPage() {
  const t = await getAdminT();

  const groups = [
    {
      title: t("admin.settings.jurisdiction"),
      rows: [
        { label: t("admin.settings.market"), value: JURISDICTION.code },
        { label: t("admin.settings.currency"), value: JURISDICTION.currency },
        { label: t("admin.settings.timezone"), value: JURISDICTION.timezone },
        { label: t("admin.settings.legalAge"), value: String(JURISDICTION.legalAge) },
        {
          label: t("admin.settings.phoneCode"),
          value: `+${JURISDICTION.phoneCallingCode}`,
        },
        { label: t("admin.settings.locales"), value: LOCALES.join(", ") },
      ],
    },
    {
      title: t("admin.settings.betting"),
      rows: [
        { label: t("admin.settings.minStake"), value: String(BETTING_RULES.minStake) },
        { label: t("admin.settings.maxStake"), value: String(BETTING_RULES.maxStake) },
        {
          label: t("admin.settings.maxSelections"),
          value: String(BETTING_RULES.maxSelectionsPerSlip),
        },
        {
          label: t("admin.settings.maxCombinedOdds"),
          value: String(BETTING_RULES.maxCombinedOdds),
        },
        {
          label: t("admin.settings.maxReturn"),
          value: String(BETTING_RULES.maxPotentialReturn),
        },
        { label: t("admin.settings.oddsFormat"), value: BETTING_RULES.oddsFormat },
      ],
    },
    {
      title: t("admin.settings.responsible"),
      rows: [
        {
          label: t("admin.settings.limitCoolingOff"),
          value: `${RESPONSIBLE_GAMBLING.limitIncreaseCoolingOffHours}h`,
        },
        {
          label: t("admin.settings.realityCheck"),
          value: `${RESPONSIBLE_GAMBLING.realityCheckMinutes}m`,
        },
        {
          label: t("admin.settings.maxSession"),
          value: `${RESPONSIBLE_GAMBLING.maxSessionMinutes}m`,
        },
        {
          label: t("admin.settings.coolingOffOptions"),
          value: RESPONSIBLE_GAMBLING.coolingOffOptionsDays.join(", "),
        },
        {
          label: t("admin.settings.exclusionOptions"),
          value: RESPONSIBLE_GAMBLING.selfExclusionOptionsMonths.join(", "),
        },
      ],
    },
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-h1 text-ink">{t("admin.settings.title")}</h1>
          <p className="mt-1 text-small text-ink-muted">
            {t("admin.settings.description")}
          </p>
        </div>
        <Badge tone={APP.isDemo ? "warning" : "success"} size="md" dot>
          {APP.mode}
        </Badge>
      </header>

      <Alert
        tone={compliance.licence ? "success" : "danger"}
        title={t("admin.settings.licence")}
      >
        {compliance.licence
          ? t("admin.settings.licenceConfigured")
          : t("admin.settings.licenceMissing")}
      </Alert>

      {groups.map((group) => (
        <section key={group.title} aria-labelledby={group.title}>
          <h2 id={group.title} className="mb-3 text-h2 text-ink">
            {group.title}
          </h2>
          <dl className="divide-y divide-line-soft overflow-hidden rounded-xl border border-line bg-surface">
            {group.rows.map((row) => (
              <div
                key={row.label}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <dt className="text-small text-ink-muted">{row.label}</dt>
                <dd className="numeric text-small font-medium text-ink">{row.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}

      <section>
        <h2 className="mb-3 text-h2 text-ink">{t("admin.settings.launchGates")}</h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          {compliance.requiredBeforeLaunch.map((gate) => (
            <li
              key={gate}
              className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface px-3 py-2.5"
            >
              <span className="min-w-0 truncate text-small text-ink-muted">
                {t(`responsible.launchGate.${gate}`)}
              </span>
              <Badge tone="danger">{t("admin.settings.gateOpen")}</Badge>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
