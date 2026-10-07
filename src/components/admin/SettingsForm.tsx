"use client";

import { updateSettingsAction } from "@/app/actions/admin";
import type { SettingDefinition, SettingGroup } from "@/server/settings/registry";
import { useT } from "@/i18n/I18nProvider";
import { Input } from "@/components/ui/Input";
import { ActionForm } from "./ActionForm";

export interface SettingsFormProps {
  group: SettingGroup;
  definitions: SettingDefinition[];
  values: Record<string, unknown>;
  readOnly: boolean;
}

/**
 * One section of the Settings screen. It is *generated* from the settings
 * registry — the same list the server validates writes against — so a control
 * can only exist for a setting the backend actually enforces.
 */
export function SettingsForm({ definitions, values, readOnly }: SettingsFormProps) {
  const t = useT();

  return (
    <ActionForm action={updateSettingsAction} submitLabel={t("admin.settings.save")} className="space-y-4">
      {() => (
        <>
          {definitions.map((definition) => (
            <input key={definition.key} type="hidden" name="keys" value={definition.key} />
          ))}

          <ul className="divide-y divide-line-soft">
            {definitions.map((definition) => {
              const value = values[definition.key];
              const label = t(`admin.settings.${definition.key}`);
              const hint = t(`admin.settings.${definition.key}.hint`);

              return (
                <li key={definition.key} className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,16rem)] sm:items-center">
                  <div className="min-w-0">
                    <p className="text-small font-semibold text-ink">{label}</p>
                    <p className="mt-0.5 text-caption normal-case leading-relaxed tracking-normal text-ink-muted">{hint}</p>
                  </div>

                  {definition.type === "boolean" ? (
                    <input
                      type="checkbox"
                      role="switch"
                      name={definition.key}
                      defaultChecked={Boolean(value)}
                      disabled={readOnly}
                      aria-label={label}
                      className="size-5 cursor-pointer accent-[var(--color-primary)]"
                    />
                  ) : definition.type === "multi" ? (
                    <fieldset disabled={readOnly} className="flex flex-wrap gap-x-4 gap-y-1.5">
                      <legend className="sr-only">{label}</legend>
                      {definition.options.map((option) => (
                        <label key={option} className="flex items-center gap-2 text-small text-ink-muted">
                          <input
                            type="checkbox"
                            name={definition.key}
                            value={option}
                            defaultChecked={(value as string[]).includes(option)}
                            className="accent-[var(--color-primary)]"
                          />
                          {t(`admin.txType.${option}`)}
                        </label>
                      ))}
                    </fieldset>
                  ) : (
                    <Input
                      name={definition.key}
                      inputMode="decimal"
                      defaultValue={String(value)}
                      disabled={readOnly}
                      aria-label={label}
                      hint={`${definition.min} – ${definition.max}`}
                      suffix={definition.type === "money" ? "TND" : undefined}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </ActionForm>
  );
}
