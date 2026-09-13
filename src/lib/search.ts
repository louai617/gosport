/**
 * Combining marks stripped before comparison: Latin accents (U+0300 range) and
 * Arabic tashkeel plus the hamza/maddah that NFD splits off أ إ آ.
 */
const COMBINING_MARKS = /[\u0300-\u036f\u0610-\u061a\u064b-\u065f\u0670]/g;

/**
 * Folds a string for searching.
 *
 * Tunisian users type the same name several ways — "Espérance" or "esperance",
 * "الإفريقي" or "الافريقي" — so accents, tashkeel and the interchangeable
 * ة/ه and ى/ي pairs are collapsed rather than compared literally.
 */
export function normalise(value: string): string {
  return value
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase()
    .replace(/\u0629/g, "\u0647") // ة -> ه
    .replace(/\u0649/g, "\u064a") // ى -> ي
    .trim();
}
