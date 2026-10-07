import type { Metadata } from "next";
import { APP, JURISDICTION } from "@/config/app.config";
import { getAdminT } from "@/i18n/server";
import { sessionEnvironment } from "@/server/auth/session";
import { can } from "@/server/auth/permissions";
import { requirePageAdmin } from "@/server/auth/pageGuard";
import { SETTING_DEFINITIONS, SETTING_GROUPS } from "@/server/settings/registry";
import { getAllSettings } from "@/server/settings/settingsService";
import { SettingsForm } from "@/components/admin/SettingsForm";

export const metadata: Metadata = { title: "Settings" };

export default async function AdminSettingsPage() {
  const user = await requirePageAdmin("settings.read");
  const [t, values] = await Promise.all([getAdminT(), getAllSettings()]);
  const readOnly = !can(user.role, "settings.update");

  // Values that come from the deployment environment, not the database. Shown so
  // the operator can see them, but they are changed where they are set.
  const environment: Array<[string, string]> = [
    [t("admin.settings.env.mode"), APP.mode],
    [t("admin.settings.env.currency"), JURISDICTION.currency],
    [t("admin.settings.env.timezone"), JURISDICTION.timezone],
    [t("admin.settings.env.sessionIdle"), `${Math.round(sessionEnvironment.idleTimeoutSeconds / 60)} min`],
    [t("admin.settings.env.sessionAbsolute"), `${Math.round(sessionEnvironment.absoluteTimeoutSeconds / 3600)} h`],
    [t("admin.settings.env.adminSessionIdle"), `${Math.round(sessionEnvironment.adminIdleTimeoutSeconds / 60)} min`],
    [t("admin.settings.env.adminSessionAbsolute"), `${Math.round(sessionEnvironment.adminAbsoluteTimeoutSeconds / 3600)} h`],
  ];

  return (
    <div className="max-w-4xl space-y-6">
      <header>
        <h1 className="text-h1 text-ink">{t("admin.settings.title")}</h1>
        <p className="mt-1 text-small text-ink-muted">{t("admin.settings.description")}</p>
      </header>

      {SETTING_GROUPS.map((group) => {
        const definitions = SETTING_DEFINITIONS.filter((definition) => definition.group === group);
        if (definitions.length === 0) return null;
        return (
          <section key={group} aria-labelledby={`g-${group}`} className="rounded-xl border border-line bg-surface p-5">
            <h2 id={`g-${group}`} className="text-h2 text-ink">{t(`admin.settings.group.${group}`)}</h2>
            <SettingsForm group={group} definitions={[...definitions]} values={values} readOnly={readOnly} />
          </section>
        );
      })}

      <section aria-labelledby="env" className="rounded-xl border border-line bg-surface p-5">
        <h2 id="env" className="text-h2 text-ink">{t("admin.settings.group.environment")}</h2>
        <p className="mt-1 text-small text-ink-muted">{t("admin.settings.env.note")}</p>
        <dl className="mt-3 divide-y divide-line-soft">
          {environment.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-3 py-2.5">
              <dt className="text-small text-ink-muted">{label}</dt>
              <dd className="numeric text-small font-medium text-ink">{value}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
