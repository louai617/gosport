export const THEMES = ["dark", "light"] as const;
export type Theme = (typeof THEMES)[number];

/** What the user picked. "system" follows the OS and can change at runtime. */
export type ThemePreference = Theme | "system";

export const THEME_COOKIE = "sportgo_theme";
export const THEME_STORAGE_KEY = "sportgo.theme";

/** SportGo's identity is the dark board; light is the alternative, not the base. */
export const DEFAULT_THEME: Theme = "dark";

export function isTheme(value: unknown): value is Theme {
  return value === "dark" || value === "light";
}

export function isThemePreference(value: unknown): value is ThemePreference {
  return isTheme(value) || value === "system";
}

/**
 * Runs before first paint, inline in the document.
 *
 * The server renders whatever the cookie says, so a returning visitor never
 * flashes. This only has work to do in two cases the server cannot resolve:
 * a first visit with no cookie, and an explicit "system" preference — both of
 * which need `prefers-color-scheme`, which exists only in the browser.
 *
 * Kept dependency-free and wrapped in try/catch: it runs before anything else,
 * so a throw here would leave the page unstyled rather than merely unthemed.
 */
export const THEME_INIT_SCRIPT = `(function(){try{
var d=document.documentElement;
var m=document.cookie.match(/(?:^|; )${THEME_COOKIE}=([^;]*)/);
var p=m?decodeURIComponent(m[1]):null;
if(!p){try{p=localStorage.getItem('${THEME_STORAGE_KEY}')}catch(e){}}
var t=(p==='light'||p==='dark')?p:(window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches?'light':'${DEFAULT_THEME}');
if(d.getAttribute('data-theme')!==t){d.setAttribute('data-theme',t);}
d.style.colorScheme=t;
}catch(e){}})();`;
