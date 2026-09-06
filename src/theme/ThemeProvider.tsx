"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  DEFAULT_THEME,
  THEME_COOKIE,
  THEME_STORAGE_KEY,
  isThemePreference,
  type Theme,
  type ThemePreference,
} from "./config";

interface ThemeContextValue {
  /** What the user chose, including "system". */
  preference: ThemePreference;
  /** What is actually applied right now. */
  theme: Theme;
  setPreference: (preference: ThemePreference) => void;
  /** Flips between the two concrete themes, resolving "system" first. */
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const ONE_YEAR = 60 * 60 * 24 * 365;

function systemTheme(): Theme {
  return window.matchMedia?.("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

function apply(theme: Theme): void {
  const root = document.documentElement;
  root.setAttribute("data-theme", theme);
  // Keeps form controls, scrollbars and the caret in step with the page.
  root.style.colorScheme = theme;
}

export function ThemeProvider({
  /** Rendered by the server from the cookie; the source of truth for SSR. */
  initialTheme,
  children,
}: {
  initialTheme: Theme;
  children: React.ReactNode;
}) {
  const [preference, setPreferenceState] = useState<ThemePreference>(initialTheme);
  const [theme, setTheme] = useState<Theme>(initialTheme);

  // Read the stored preference after mount. It cannot be read during render:
  // the server has no access to it, and using it in the first client render
  // would produce a hydration mismatch on every themed element.
  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(THEME_STORAGE_KEY);
    } catch {
      // Private mode or blocked storage — the cookie value stands.
    }

    const next = isThemePreference(stored) ? stored : initialTheme;
    setPreferenceState(next);

    const resolved = next === "system" ? systemTheme() : next;
    setTheme(resolved);
    apply(resolved);
  }, [initialTheme]);

  // Only while following the system: an explicit choice must not be overridden
  // when the OS flips at sunset.
  useEffect(() => {
    if (preference !== "system") return;

    const media = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => {
      const resolved = systemTheme();
      setTheme(resolved);
      apply(resolved);
    };

    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [preference]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);

    const resolved = next === "system" ? systemTheme() : next;
    setTheme(resolved);
    apply(resolved);

    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Non-fatal: the cookie below still survives a reload.
    }

    // The cookie is what lets the *server* render the right theme, which is
    // what prevents the flash. localStorage alone cannot do that.
    document.cookie = `${THEME_COOKIE}=${next};path=/;max-age=${ONE_YEAR};samesite=lax`;
  }, []);

  const toggle = useCallback(() => {
    setPreference(theme === "dark" ? "light" : "dark");
  }, [theme, setPreference]);

  const value = useMemo<ThemeContextValue>(
    () => ({ preference, theme, setPreference, toggle }),
    [preference, theme, setPreference, toggle],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used inside <ThemeProvider>");
  }
  return context;
}

export { DEFAULT_THEME };
