"use client";

import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/cn";
import { useT } from "@/i18n/I18nProvider";
import { useTheme } from "@/theme/ThemeProvider";

export interface ThemeToggleProps {
  /** `full` adds a text label — used inside the mobile drawer. */
  variant?: "icon" | "full";
  className?: string;
}

/**
 * Dark/light switch.
 *
 * Both icons are always in the DOM and cross-fade with a short rotation, so the
 * change reads as one control changing state rather than two icons swapping.
 * `aria-pressed` carries the state for assistive tech — the icon alone would be
 * colour-and-shape only.
 */
export function ThemeToggle({ variant = "icon", className }: ThemeToggleProps) {
  const t = useT();
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";

  const label = isDark ? t("theme.switchToLight") : t("theme.switchToDark");

  const icons = (
    <span aria-hidden="true" className="relative grid size-[17px] place-items-center">
      <Sun
        size={17}
        className={cn(
          "absolute transition-[opacity,transform] duration-base ease-out-quint",
          isDark ? "rotate-90 scale-50 opacity-0" : "rotate-0 scale-100 opacity-100",
        )}
      />
      <Moon
        size={17}
        className={cn(
          "absolute transition-[opacity,transform] duration-base ease-out-quint",
          isDark ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-50 opacity-0",
        )}
      />
    </span>
  );

  if (variant === "full") {
    return (
      <button
        type="button"
        onClick={toggle}
        aria-pressed={!isDark}
        className={cn(
          "flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2.5 text-small text-ink-muted transition-colors duration-fast hover:bg-surface-2 hover:text-ink",
          className,
        )}
      >
        {icons}
        {isDark ? t("theme.lightMode") : t("theme.darkMode")}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      aria-pressed={!isDark}
      title={label}
      className={cn(
        "grid size-8 shrink-0 cursor-pointer place-items-center rounded-md text-ink-muted transition-colors duration-fast hover:bg-surface-2 hover:text-ink",
        className,
      )}
    >
      {icons}
    </button>
  );
}
