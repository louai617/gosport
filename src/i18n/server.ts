import "server-only";
import { cookies } from "next/headers";
import { LOCALE_COOKIE, resolveLocale, type Locale } from "./config";
import { getAdminDictionary, getDictionary } from "./dictionaries";
import { createTranslator } from "./translate";
import type { TranslateFn } from "./types";

/** Reads the active locale from the request cookie. */
export async function getRequestLocale(): Promise<Locale> {
  const store = await cookies();
  return resolveLocale(store.get(LOCALE_COOKIE)?.value);
}

/** Server-component translator for the current request. */
export async function getT(locale?: Locale): Promise<TranslateFn> {
  const active = locale ?? (await getRequestLocale());
  return createTranslator(await getDictionary(active));
}

export async function getAdminT(locale?: Locale): Promise<TranslateFn> {
  const active = locale ?? (await getRequestLocale());
  return createTranslator(await getAdminDictionary(active));
}
