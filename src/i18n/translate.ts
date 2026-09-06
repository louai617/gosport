import type { Dictionary, TranslateFn, TranslateParams } from "./types";

const PLACEHOLDER = /\{(\w+)\}/g;

/**
 * Builds a translate function over a flat dictionary.
 *
 * - `{name}` placeholders are interpolated from `params`.
 * - A missing key returns the key itself and warns in development, which makes
 *   untranslated strings obvious in review without breaking the page.
 */
export function createTranslator(dictionary: Dictionary): TranslateFn {
  return function t(key: string, params?: TranslateParams): string {
    const template = dictionary[key];

    if (template === undefined) {
      if (process.env.NODE_ENV === "development") {
        // eslint-disable-next-line no-console
        console.warn(`[i18n] missing key: ${key}`);
      }
      return key;
    }

    if (!params) return template;

    return template.replace(PLACEHOLDER, (match, name: string) => {
      const value = params[name];
      return value === undefined ? match : String(value);
    });
  };
}
