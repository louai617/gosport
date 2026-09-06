import "server-only";
import { cookies } from "next/headers";
import { DEFAULT_THEME, THEME_COOKIE, isTheme, type Theme } from "./config";

/**
 * The theme to render on the server.
 *
 * Only an explicit "dark"/"light" cookie can be honoured here — "system" and a
 * first visit both depend on `prefers-color-scheme`, which the server cannot
 * see. Those fall back to the default and are corrected before paint by
 * `THEME_INIT_SCRIPT`.
 */
export async function getServerTheme(): Promise<Theme> {
  const store = await cookies();
  const value = store.get(THEME_COOKIE)?.value;
  return isTheme(value) ? value : DEFAULT_THEME;
}
