import { piiHashSalt } from "@/server/env";
import { sha256Hex } from "@/server/security/sanitize";

/**
 * Redaction for anything that is logged or stored as audit metadata: secrets
 * are dropped by key name, e-mail addresses are hashed, phone numbers masked.
 */

/** Field names whose value is never useful and always dangerous in a log. */
const SECRET_KEY_PATTERN =
  /(pass(word)?|secret|token|api[_-]?key|authorization|cookie|session|csrf|otp|pin|cvv|cvc|pan|iban|card|signature|private)/i;

const EMAIL_KEY_PATTERN = /email/i;
const PHONE_KEY_PATTERN = /phone|msisdn|mobile/i;

const REDACTED = "[redacted]";
const MAX_DEPTH = 6;
const MAX_ARRAY_ITEMS = 50;
const MAX_STRING_LENGTH = 512;

/**
 * Deterministic pseudonym for an email address.
 *
 * An investigator needs to correlate events for one account without the log
 * itself becoming a mailing list; a salted digest gives correlation and nothing
 * else. Support looks the account up by id, which is already in the record.
 */
export function hashEmail(email: string): string {
  return `email:${sha256Hex(`email:${piiHashSalt}:${email.trim().toLowerCase()}`).slice(0, 24)}`;
}

/**
 * Keeps the country and operator prefix, drops the subscriber digits. Enough to
 * spot a fraud ring sharing one number range, useless for contacting anyone.
 */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 6) return REDACTED;
  const prefix = phone.trim().startsWith("+") ? "+" : "";
  return `${prefix}${digits.slice(0, digits.length - 6)}${"*".repeat(4)}${digits.slice(-2)}`;
}

const EMAIL_IN_TEXT = /[^\s@]+@[^\s@]+\.[^\s@]+/g;

/**
 * Recursively strips or pseudonymises anything a log must not hold.
 *
 * Pure: same input, same output, no clock and no I/O — so the rules below can
 * be unit-tested directly, which matters because this is the one function
 * standing between a stack trace and a data-protection incident.
 */
export function redact(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (depth > MAX_DEPTH) return "[truncated]";

  if (typeof value === "string") {
    // A value can carry an address even when its key does not say so — an
    // error message, a query echo, a provider payload.
    const withoutEmails = value.replace(EMAIL_IN_TEXT, (match) => hashEmail(match));
    return withoutEmails.length > MAX_STRING_LENGTH
      ? `${withoutEmails.slice(0, MAX_STRING_LENGTH)}…`
      : withoutEmails;
  }

  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();

  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ARRAY_ITEMS).map((item) => redact(item, depth + 1));
    if (value.length > MAX_ARRAY_ITEMS) items.push(`[+${value.length - MAX_ARRAY_ITEMS} more]`);
    return items;
  }

  if (value instanceof Error) {
    // Driver errors carry their diagnosis in `code` (Prisma P-codes), which the
    // message alone truncates away.
    const code = (value as { code?: unknown }).code;
    return {
      name: value.name,
      ...(typeof code === "string" ? { code } : {}),
      message: redact(value.message, depth + 1),
    };
  }

  if (typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEY_PATTERN.test(key)) {
        output[key] = REDACTED;
        continue;
      }
      if (typeof entry === "string" && EMAIL_KEY_PATTERN.test(key)) {
        output[key] = hashEmail(entry);
        continue;
      }
      if (typeof entry === "string" && PHONE_KEY_PATTERN.test(key)) {
        output[key] = maskPhone(entry);
        continue;
      }
      output[key] = redact(entry, depth + 1);
    }
    return output;
  }

  // Functions, symbols — nothing a log should carry.
  return REDACTED;
}

