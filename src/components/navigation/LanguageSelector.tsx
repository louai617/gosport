"use client";

import { Check, Globe } from "lucide-react";
import { LOCALES, LOCALE_META, type Locale } from "@/i18n/config";
import { useI18n } from "@/i18n/I18nProvider";
import { Dropdown, DropdownItem, DropdownLabel } from "@/components/ui/Dropdown";

export interface LanguageSelectorProps {
  /** `compact` shows only the code; `full` shows the native name. */
  variant?: "compact" | "full";
}

export function LanguageSelector({ variant = "compact" }: LanguageSelectorProps) {
  const { locale, setLocale, t } = useI18n();

  return (
    <Dropdown
      align="end"
      width="w-44"
      label={t("nav.language")}
      trigger={
        <span className="flex h-8 items-center gap-1.5 rounded-md px-2 text-small text-ink-muted transition-colors duration-fast hover:bg-surface-2 hover:text-ink">
          <Globe size={15} aria-hidden="true" />
          <span className="uppercase">
            {variant === "compact" ? locale : LOCALE_META[locale].label}
          </span>
        </span>
      }
    >
      <DropdownLabel>{t("nav.language")}</DropdownLabel>
      {LOCALES.map((code: Locale) => (
        <DropdownItem
          key={code}
          active={code === locale}
          onSelect={() => setLocale(code)}
          trailing={code === locale ? <Check size={14} aria-hidden="true" /> : undefined}
        >
          {/* Each language is written in its own script — a reader looking for
              العربية should not have to find "Arabic" first. */}
          {LOCALE_META[code].label}
        </DropdownItem>
      ))}
    </Dropdown>
  );
}
