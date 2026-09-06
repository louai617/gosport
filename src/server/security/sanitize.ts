import { createHash, timingSafeEqual } from "node:crypto";

import { piiHashSalt } from "@/server/env";

/**
 * Small, dependency-free primitives shared by the rest of `src/server`.
 *
 * Everything here is pure and synchronous so it can be unit-tested without a
 * request, a database or a clock.
 */

const HTML_ENTITIES: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
  "/": "&#x2F;",
};

/**
 * React escapes everything it renders, so this is not the app's XSS defence —
 * it exists for the places React is not involved: emailed HTML, CSV exports,
 * and any string that ends up inside a `<script type="application/json">`
 * block. Reach for it there, never as a substitute for parameterised output.
 */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"'/]/g, (character) => HTML_ENTITIES[character] ?? character);
}

/**
 * C0/C1 control characters, zero-width characters, word joiners and
 * bidirectional overrides. Tab, newline and carriage return are preserved so
 * this stays safe to run over multi-line free text.
 */
const INVISIBLE_CHARS =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u00AD\u200B-\u200F\u2028\u2029\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g;

/**
 * Strips characters that occupy no width but change how the rest of the string
 * reads.
 *
 * The bidi range matters more than usual here: SportGo renders Arabic
 * right-to-left beside Latin team names, and a U+202E inside a display name can
 * visually reverse the text around it — enough to make a support agent read one
 * account reference as another.
 */
export function stripControlChars(value: string): string {
  return value.replace(INVISIBLE_CHARS, "");
}

/** Lowercase hex SHA-256. */
export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/**
 * One-way, salted IP identifier for rate-limit buckets and audit records.
 *
 * The IPv4 space is small enough to brute-force, so an unsalted hash is
 * pseudonymisation in name only. The salt lives in `PII_HASH_SALT` and rotating
 * it deliberately breaks the link between old and new records.
 */
export function hashIp(ip: string | null | undefined): string {
  const normalised = (ip ?? "").trim().toLowerCase();
  if (normalised === "") return "unknown";
  return sha256Hex(`ip:${piiHashSalt}:${normalised}`).slice(0, 32);
}

/**
 * Length-independent comparison.
 *
 * `timingSafeEqual` throws on mismatched lengths, and returning early on that
 * would leak the length of the secret. Digesting both sides first gives two
 * fixed-width buffers, so the comparison reveals nothing but the verdict.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  const left = createHash("sha256").update(a, "utf8").digest();
  const right = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(left, right);
}

/**
 * Resolves a caller-supplied `next` / `returnTo` parameter to a path that is
 * definitely on this origin, or falls back.
 *
 * Open redirects are the delivery mechanism for most credential phishing against
 * a betting site: the link genuinely starts at the real domain, so it survives
 * inspection, and the victim lands on a copy of the login page. The rules are
 * therefore deny-by-default — anything not provably local returns `fallback`.
 */
export function safeRedirect(
  target: string | null | undefined,
  allowedOrigin: string,
  fallback = "/",
): string {
  if (typeof target !== "string") return fallback;

  const candidate = stripControlChars(target).trim();
  if (candidate === "") return fallback;

  // `//evil.com` and `/\evil.com` are protocol-relative: a browser reads them as
  // absolute URLs, while a naive "starts with /" check reads them as paths.
  if (/^[/\\]{2}/.test(candidate)) return fallback;

  // A bare absolute path is the only form accepted without URL parsing.
  if (candidate.startsWith("/")) return candidate;

  let parsed: URL;
  let allowed: URL;
  try {
    parsed = new URL(candidate);
    allowed = new URL(allowedOrigin);
  } catch {
    return fallback;
  }

  // Rejects javascript:, data: and any other scheme before the origin check.
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return fallback;
  if (parsed.origin !== allowed.origin) return fallback;

  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}
