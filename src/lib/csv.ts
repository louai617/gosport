/**
 * CSV generation.
 *
 * Two things a naive `join(",")` gets wrong:
 *
 * 1. Quoting — a field containing a comma, a quote or a newline must be wrapped
 *    in quotes with inner quotes doubled, or one value shifts every column after it.
 * 2. **Formula injection.** A cell starting with `=`, `+`, `-`, `@` (or a tab /
 *    carriage return) is executed as a formula when the file is opened in Excel
 *    or Sheets. A player who sets their display name to `=HYPERLINK(...)` would
 *    otherwise turn an operator's export into an attack on the operator. Those
 *    cells are prefixed with an apostrophe, which makes spreadsheets treat them
 *    as text.
 *
 * A UTF-8 BOM is prepended so Excel reads Arabic and accented text correctly.
 */
const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return "";
  let text = typeof value === "number" ? String(value) : String(value);
  // Numbers are safe as-is (a leading "-" there is a sign, not a formula).
  if (typeof value !== "number" && FORMULA_START.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(
  headers: readonly string[],
  rows: ReadonlyArray<ReadonlyArray<string | number | boolean | null | undefined>>,
): string {
  const lines = [headers.map(csvCell).join(",")];
  for (const row of rows) lines.push(row.map(csvCell).join(","));
  return `﻿${lines.join("\r\n")}\r\n`;
}
