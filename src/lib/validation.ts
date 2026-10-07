import { z } from "zod";

import {
  BETTING_RULES,
  JURISDICTION,
} from "@/config/app.config";
import { LOCALES } from "@/i18n/config";
import type { ApiFieldError } from "@/types/api";
import type { LimitKind, LimitPeriod } from "@/types/user";

/**
 * Shared validation schemas.
 *
 * Isomorphic on purpose: the exact same schema validates a form in the browser
 * and the body of the route handler behind it. The client copy exists to give
 * fast feedback — it is never the authority. Every route re-parses on the
 * server (see `withRoute` in `src/server/api.ts`).
 *
 * Every message is an i18n key, never a sentence. Forms render it through
 * `t()`, and `ApiFieldError.messageKey` carries it across the wire, so an error
 * reads correctly in French, Arabic and English without server-side locale
 * negotiation.
 */

/* ========================================================================== */
/* primitives                                                                 */
/* ========================================================================== */

/** Control characters, zero-width joiners and bidi overrides. */
const UNSAFE_TEXT =
  /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g;

/** Letters (any script, so Arabic and accented Latin both pass), marks, spacing. */
const NAME_PATTERN = /^[\p{L}\p{M}][\p{L}\p{M} '\u2019.-]{0,62}[\p{L}\p{M}.]$/u;

const PHONE_NATIONAL = new RegExp(JURISDICTION.phonePattern);

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The most-abused passwords, kept short and lowercase-compared. This is a
 * floor, not a control: production must check the candidate against a breach
 * corpus (HIBP's k-anonymity range API or a local Bloom filter of the Pwned
 * Passwords set) before accepting it.
 */
const COMMON_PASSWORDS: ReadonlySet<string> = new Set([
  "123456", "123456789", "12345678", "1234567890", "1234567",
  "password", "password1", "password123", "passw0rd", "p@ssw0rd",
  "qwerty", "qwerty123", "qwertyuiop", "qwertyui", "1q2w3e4r",
  "azerty", "azerty123", "azertyuiop", "motdepasse", "bonjour1",
  "iloveyou", "sunshine", "princess", "welcome", "welcome1",
  "welcome123", "admin", "admin123", "administrator", "root123",
  "letmein", "letmein123", "trustno1", "whatever", "changeme",
  "monkey", "dragon", "master", "shadow", "superman",
  "batman", "football", "football1", "baseball", "basketball",
  "starwars", "computer", "internet", "abc123", "abcd1234",
]);

const CLASS_LOWER = /[a-z\p{Ll}]/u;
const CLASS_UPPER = /[A-Z\p{Lu}]/u;
const CLASS_DIGIT = /\d/;
const CLASS_SYMBOL = /[^\p{L}\p{N}]/u;

/* ========================================================================== */
/* identity                                                                   */
/* ========================================================================== */

export const emailSchema = z
  .string({ message: "auth.validation.emailRequired" })
  .trim()
  .toLowerCase()
  // RFC 5321 caps the whole address at 254 octets; anything longer is abuse.
  .max(254, { message: "auth.validation.emailTooLong" })
  .pipe(z.email({ message: "auth.validation.emailInvalid" }));

export type Email = z.infer<typeof emailSchema>;

/** Names that would let an account pass for the platform or its staff. */
const RESERVED_USERNAMES: ReadonlySet<string> = new Set([
  "admin", "administrator", "root", "system", "support", "staff", "moderator",
  "sportgo", "security", "billing", "cashier", "help", "official", "null",
  "undefined", "api", "www", "mail", "postmaster",
]);

/**
 * Public handle. Lower-cased on the way in, so `Alice` and `alice` are one
 * account — uniqueness is only meaningful on the canonical form.
 */
export const usernameSchema = z
  .string({ message: "auth.validation.usernameRequired" })
  .trim()
  .toLowerCase()
  .min(3, { message: "auth.validation.usernameInvalid" })
  .max(24, { message: "auth.validation.usernameInvalid" })
  .regex(/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/, { message: "auth.validation.usernameInvalid" })
  .refine((value) => !RESERVED_USERNAMES.has(value), {
    message: "auth.validation.usernameReserved",
  });

export type Username = z.infer<typeof usernameSchema>;

/**
 * Length first, composition second, deny-list last.
 *
 * No maximum below 128: truncating a passphrase silently weakens it, and users
 * who reach for a password manager deserve the room. 128 is only there to stop
 * a megabyte reaching the hashing function.
 */
export const passwordSchema = z
  .string({ message: "auth.validation.passwordRequired" })
  .min(10, { message: "auth.validation.passwordTooShort" })
  .max(128, { message: "auth.validation.passwordTooLong" })
  .regex(CLASS_LOWER, { message: "auth.validation.passwordNeedsLower" })
  .regex(CLASS_UPPER, { message: "auth.validation.passwordNeedsUpper" })
  .regex(CLASS_DIGIT, { message: "auth.validation.passwordNeedsDigit" })
  .refine((value) => !COMMON_PASSWORDS.has(value.toLowerCase()), {
    message: "auth.validation.passwordTooCommon",
  });

export type Password = z.infer<typeof passwordSchema>;

/** Used where the policy must not apply — logging in with an old password. */
const existingPasswordSchema = z
  .string({ message: "auth.validation.passwordRequired" })
  .min(1, { message: "auth.validation.passwordRequired" })
  .max(128, { message: "auth.validation.passwordTooLong" });

export const nameSchema = z
  .string({ message: "auth.validation.nameRequired" })
  .transform((value) => value.replace(UNSAFE_TEXT, "").replace(/\s+/g, " ").trim())
  .pipe(
    z
      .string()
      .min(2, { message: "auth.validation.nameTooShort" })
      .max(64, { message: "auth.validation.nameTooLong" })
      .regex(NAME_PATTERN, { message: "auth.validation.nameInvalid" }),
  );

export type Name = z.infer<typeof nameSchema>;

/**
 * Accepts what people actually type — `20 123 456`, `+216 20 123 456`,
 * `00216-20-123-456` — and always stores E.164. Validation runs against the
 * jurisdiction's national pattern, so re-pointing the app at another market is
 * a config change, not a code change.
 */
function toNationalNumber(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  const cc = JURISDICTION.phoneCallingCode;
  const nationalLength = JURISDICTION.phoneNationalLength;

  if (digits.startsWith(`00${cc}`)) return digits.slice(2 + cc.length);
  if (digits.length === cc.length + nationalLength && digits.startsWith(cc)) {
    return digits.slice(cc.length);
  }
  return digits;
}

export const phoneSchema = z
  .string({ message: "auth.validation.phoneRequired" })
  .trim()
  .transform(toNationalNumber)
  .refine((national) => PHONE_NATIONAL.test(national), {
    message: "auth.validation.phoneInvalid",
  })
  .transform((national) => `+${JURISDICTION.phoneCallingCode}${national}`);

export type Phone = z.infer<typeof phoneSchema>;

/**
 * Age is computed in UTC from calendar components rather than by subtracting
 * timestamps, so a player never gains or loses a day to a timezone offset.
 */
function ageOn(isoDate: string, reference: Date): number {
  const [year, month, day] = isoDate.split("-").map(Number);
  let age = reference.getUTCFullYear() - year;
  const refMonth = reference.getUTCMonth() + 1;
  const beforeBirthday =
    refMonth < month || (refMonth === month && reference.getUTCDate() < day);
  if (beforeBirthday) age -= 1;
  return age;
}

function isRealDate(isoDate: string): boolean {
  const [year, month, day] = isoDate.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

export const dateOfBirthSchema = z
  .string({ message: "auth.validation.dobRequired" })
  .trim()
  .regex(ISO_DATE, { message: "auth.validation.dobFormat" })
  .refine(isRealDate, { message: "auth.validation.dobInvalid" })
  .refine((value) => ageOn(value, new Date()) <= 120, {
    message: "auth.validation.dobInvalid",
  })
  .refine((value) => ageOn(value, new Date()) >= JURISDICTION.legalAge, {
    message: "auth.validation.dobUnderage",
  });

export type DateOfBirth = z.infer<typeof dateOfBirthSchema>;

export const countrySchema = z
  .string({ message: "auth.validation.countryRequired" })
  .trim()
  .toUpperCase()
  .pipe(
    z.string().regex(/^[A-Z]{2}$/, { message: "auth.validation.countryInvalid" }),
  );

export type CountryCode = z.infer<typeof countrySchema>;

export const localeSchema = z.enum(LOCALES, {
  message: "common.validation.localeInvalid",
});

export type LocaleInput = z.infer<typeof localeSchema>;

/* ========================================================================== */
/* money & odds                                                               */
/* ========================================================================== */

interface DecimalOptions {
  min: number;
  max: number;
  /** Maximum fraction digits accepted. */
  decimals: number;
  keys: { invalid: string; min: string; max: string; precision: string };
}

/** Float comparison with a tolerance, so 12.30 does not read as 3 decimals. */
function hasAtMostDecimals(value: number, decimals: number): boolean {
  const scaled = value * 10 ** decimals;
  return Math.abs(scaled - Math.round(scaled)) < 1e-6;
}

/**
 * Numeric fields arrive as strings from forms and as numbers from JSON, and
 * Tunisian keyboards produce a decimal comma. One schema absorbs all three and
 * always yields a `number`.
 */
function decimalSchema({ min, max, decimals, keys }: DecimalOptions) {
  return z
    .union([z.string(), z.number()])
    .transform((raw) => {
      if (typeof raw === "number") return raw;
      const cleaned = raw.trim().replace(/\s/g, "").replace(",", ".");
      return cleaned === "" ? Number.NaN : Number(cleaned);
    })
    .refine((value) => Number.isFinite(value), { message: keys.invalid })
    .refine((value) => value >= min, { message: keys.min })
    .refine((value) => value <= max, { message: keys.max })
    .refine((value) => hasAtMostDecimals(value, decimals), {
      message: keys.precision,
    });
}

/**
 * General-purpose money field. Bounds are deliberately wide; every endpoint
 * narrows them again against the player's own limits, server-side.
 */
export const amountSchema = decimalSchema({
  min: 0.01,
  max: 1_000_000,
  decimals: 2,
  keys: {
    invalid: "wallet.validation.amountInvalid",
    min: "wallet.validation.amountTooLow",
    max: "wallet.validation.amountTooHigh",
    precision: "wallet.validation.amountPrecision",
  },
});

export type Amount = z.infer<typeof amountSchema>;

export const stakeSchema = decimalSchema({
  min: BETTING_RULES.minStake,
  max: BETTING_RULES.maxStake,
  decimals: 2,
  keys: {
    invalid: "betting.validation.stakeInvalid",
    min: "betting.validation.stakeTooLow",
    max: "betting.validation.stakeTooHigh",
    precision: "betting.validation.stakePrecision",
  },
});

export type Stake = z.infer<typeof stakeSchema>;

/**
 * Odds are echoed back by the client so the server can detect that the price
 * moved between rendering and submission. They are never trusted as the price:
 * settlement always uses the server's own book.
 */
export const oddsSchema = decimalSchema({
  min: 1.01,
  max: BETTING_RULES.maxCombinedOdds,
  decimals: 2,
  keys: {
    invalid: "betting.validation.oddsInvalid",
    min: "betting.validation.oddsTooLow",
    max: "betting.validation.oddsTooHigh",
    precision: "betting.validation.oddsPrecision",
  },
});

export type Odds = z.infer<typeof oddsSchema>;

/* ========================================================================== */
/* auth flows                                                                 */
/* ========================================================================== */

const idSchema = z
  .string()
  .trim()
  .min(1, { message: "common.validation.required" })
  .max(64, { message: "common.validation.tooLong" })
  .regex(/^[A-Za-z0-9_-]+$/, { message: "common.validation.invalid" });

export const registerSchema = z
  .object({
    username: usernameSchema,
    firstName: nameSchema,
    lastName: nameSchema,
    email: emailSchema,
    phone: phoneSchema,
    password: passwordSchema,
    confirmPassword: z.string({ message: "auth.validation.confirmRequired" }),
    dateOfBirth: dateOfBirthSchema,
    country: countrySchema,

    /**
     * SELF-DECLARATION ONLY. Ticking this box is not age verification: it is a
     * statement by an anonymous visitor, worth nothing on its own. Before any
     * account may place a real wager or deposit real money, a licensed
     * identity-verification provider must confirm the player's date of birth
     * against a government or credit-bureau source, and the account must stay
     * gated until `User.kycStatus === "verified"`. `dateOfBirthSchema` blocking
     * an underage date is an input check, not a control.
     */
    ageConfirmed: z.literal(true, {
      message: "auth.validation.ageConfirmRequired",
    }),
    termsAccepted: z.literal(true, {
      message: "auth.validation.termsRequired",
    }),
    marketingOptIn: z.boolean().optional().default(false),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "auth.validation.passwordsDiffer",
    path: ["confirmPassword"],
  })
  .refine((value) => !value.password.toLowerCase().includes(value.email.split("@")[0]), {
    message: "auth.validation.passwordContainsEmail",
    path: ["password"],
  });

export type RegisterInput = z.infer<typeof registerSchema>;

/** E-mail address or username — resolved server-side against the canonical forms. */
export const identifierSchema = z
  .string({ message: "auth.validation.identifierRequired" })
  .trim()
  .toLowerCase()
  .min(3, { message: "auth.validation.identifierRequired" })
  .max(254, { message: "auth.validation.identifierRequired" });

export const loginSchema = z.object({
  identifier: identifierSchema,
  password: existingPasswordSchema,
  rememberMe: z.boolean().optional().default(false),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    token: z
      .string({ message: "auth.validation.tokenRequired" })
      .trim()
      .min(32, { message: "auth.validation.tokenInvalid" })
      .max(256, { message: "auth.validation.tokenInvalid" }),
    password: passwordSchema,
    confirmPassword: z.string({ message: "auth.validation.confirmRequired" }),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "auth.validation.passwordsDiffer",
    path: ["confirmPassword"],
  });

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: existingPasswordSchema,
    newPassword: passwordSchema,
    confirmPassword: z.string({ message: "auth.validation.confirmRequired" }),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    message: "auth.validation.passwordsDiffer",
    path: ["confirmPassword"],
  })
  .refine((value) => value.newPassword !== value.currentPassword, {
    message: "auth.validation.passwordUnchanged",
    path: ["newPassword"],
  });

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/* ========================================================================== */
/* wallet                                                                     */
/* ========================================================================== */

/**
 * The amount is validated again on the server against the method's own
 * min/max, the player's deposit limit and the current window's usage — those
 * depend on state the client does not hold.
 */
export const depositSchema = z.object({
  methodId: idSchema,
  amount: amountSchema,
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .pipe(z.string().length(3, { message: "wallet.validation.currencyInvalid" }))
    .optional(),
});

export type DepositInput = z.infer<typeof depositSchema>;

export const withdrawalSchema = z.object({
  methodId: idSchema,
  amount: amountSchema,
  /**
   * Withdrawals are the AML choke point: source-of-funds checks, sanctions
   * screening and the KYC gate all run server-side before this is honoured.
   */
  confirmOwnership: z.literal(true, {
    message: "wallet.validation.ownershipRequired",
  }),
  /** Minted when the form renders, so a double-click or a retry books one withdrawal. */
  idempotencyKey: z.string().trim().min(8).max(128).optional(),
});

export type WithdrawalInput = z.infer<typeof withdrawalSchema>;

/* ========================================================================== */
/* responsible gambling                                                       */
/* ========================================================================== */

const LIMIT_KINDS = [
  "deposit",
  "stake",
  "loss",
  "single_bet",
] as const satisfies readonly LimitKind[];

const LIMIT_PERIODS = [
  "daily",
  "weekly",
  "monthly",
] as const satisfies readonly LimitPeriod[];

/**
 * A decrease applies immediately; an increase only takes effect after the
 * cooling-off window in `RESPONSIBLE_GAMBLING`. That asymmetry is enforced on
 * the server — this schema only checks the shape of the request.
 */
export const limitChangeSchema = z
  .object({
    kind: z.enum(LIMIT_KINDS, { message: "responsible.validation.kindInvalid" }),
    period: z.enum(LIMIT_PERIODS, { message: "responsible.validation.periodInvalid" }),
    /** Amount in TND. */
    value: z.number({ message: "responsible.validation.valueInvalid" }),
  })
  .superRefine((input, ctx) => {
    if (input.value < 1) {
      ctx.addIssue({
        code: "custom",
        path: ["value"],
        message: "responsible.validation.valueTooLow",
      });
    }
    if (input.value > 1_000_000) {
      ctx.addIssue({
        code: "custom",
        path: ["value"],
        message: "responsible.validation.valueTooHigh",
      });
    }
    if (!hasAtMostDecimals(input.value, 2)) {
      ctx.addIssue({
        code: "custom",
        path: ["value"],
        message: "responsible.validation.valuePrecision",
      });
    }
  });

export type LimitChangeInput = z.infer<typeof limitChangeSchema>;

/* ========================================================================== */
/* profile                                                                    */
/* ========================================================================== */

/**
 * Email and date of birth are absent on purpose: changing either one is a
 * re-verification flow with its own confirmation step, not a profile edit.
 */
export const profileUpdateSchema = z.object({
  firstName: nameSchema,
  lastName: nameSchema,
  phone: phoneSchema,
  locale: localeSchema,
  marketingOptIn: z.boolean().optional().default(false),
});

export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;

/** Public display name: what other screens show instead of a full name. */
export const displayNameSchema = z
  .string({ message: "auth.validation.nameRequired" })
  .transform((value) => value.replace(UNSAFE_TEXT, "").replace(/\s+/g, " ").trim())
  .pipe(
    z
      .string()
      .min(2, { message: "auth.validation.nameTooShort" })
      .max(40, { message: "auth.validation.nameTooLong" }),
  );

/** What a player may edit about themselves. Identity data is an operator decision. */
export const ownProfileSchema = z.object({
  phone: phoneSchema,
  displayName: displayNameSchema,
});

export type OwnProfileInput = z.infer<typeof ownProfileSchema>;

/* ========================================================================== */
/* betting                                                                    */
/* ========================================================================== */

const betSelectionSchema = z.object({
  selectionId: idSchema,
  marketId: idSchema,
  eventId: idSchema,
  /** The price the player saw. Compared against the book, never trusted as it. */
  odds: oddsSchema,
  /** Per-selection stake, `single` mode only. */
  stake: stakeSchema.optional(),
});

/**
 * Note what this schema does *not* accept: `potentialReturn`, `totalOdds` and
 * `combinedOdds`. Those are computed by the server from its own prices. The
 * client's arithmetic in `lib/betting.ts` exists to render a preview and has
 * no authority over what is booked.
 */
export const betPlacementSchema = z
  .object({
    mode: z.enum(["single", "multiple", "system"], {
      message: "betting.validation.modeInvalid",
    }),
    selections: z
      .array(betSelectionSchema)
      .min(1, { message: "betting.validation.noSelections" })
      .max(BETTING_RULES.maxSelectionsPerSlip, {
        message: "betting.validation.tooManySelections",
      }),
    /** Shared stake for `multiple` and per-line stake for `system`. */
    stake: stakeSchema.optional(),
    systemSize: z.number().int().min(2).max(BETTING_RULES.maxSelectionsPerSlip).optional(),
    /**
     * When false, any price movement between rendering and submission voids the
     * request instead of booking the new price.
     */
    acceptOddsChange: z.boolean().optional().default(false),
    idempotencyKey: z.string().trim().min(8).max(128).optional(),
  })
  .superRefine((input, ctx) => {
    const count = input.selections.length;

    if (input.mode === "single") {
      input.selections.forEach((selection, index) => {
        if (selection.stake === undefined) {
          ctx.addIssue({
            code: "custom",
            path: ["selections", index, "stake"],
            message: "betting.validation.stakeRequired",
          });
        }
      });
      return;
    }

    if (input.stake === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["stake"],
        message: "betting.validation.stakeRequired",
      });
    }

    if (input.mode === "multiple") {
      if (count < BETTING_RULES.minSelectionsForMultiple) {
        ctx.addIssue({
          code: "custom",
          path: ["selections"],
          message: "betting.validation.needTwoForMultiple",
        });
      }
      return;
    }

    if (count < BETTING_RULES.minSelectionsForSystem) {
      ctx.addIssue({
        code: "custom",
        path: ["selections"],
        message: "betting.validation.needThreeForSystem",
      });
    }
    if (input.systemSize === undefined || input.systemSize > count - 1) {
      ctx.addIssue({
        code: "custom",
        path: ["systemSize"],
        message: "betting.validation.systemSizeInvalid",
      });
    }
  });

export type BetPlacementInput = z.infer<typeof betPlacementSchema>;

/* ========================================================================== */
/* list queries                                                               */
/* ========================================================================== */

/** Query params arrive as strings, and an unset one arrives as "". */
function queryInt(fallback: number, min: number, max: number) {
  return z.preprocess(
    (value) => (value === "" || value === null || value === undefined ? undefined : value),
    z.coerce
      .number({ message: "common.validation.invalid" })
      .int({ message: "common.validation.invalid" })
      .min(min, { message: "common.validation.invalid" })
      .max(max, { message: "common.validation.invalid" })
      .default(fallback),
  );
}

export const listQuerySchema = z.object({
  page: queryInt(1, 1, 10_000),
  /** Capped so a single request can never ask the database for everything. */
  pageSize: queryInt(20, 1, 100),
  search: z
    .string()
    .transform((value) => value.replace(UNSAFE_TEXT, "").trim())
    .pipe(z.string().max(100, { message: "common.validation.tooLong" }))
    .optional(),
  /** Column allow-listing happens at the call site; this only bounds the shape. */
  sort: z
    .string()
    .trim()
    .regex(/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/, { message: "common.validation.invalid" })
    .optional(),
  direction: z.enum(["asc", "desc"]).default("asc"),
});

export type ListQueryInput = z.infer<typeof listQuerySchema>;

/* ========================================================================== */
/* helpers                                                                    */
/* ========================================================================== */

/**
 * Password-meter score. Deliberately crude and synchronous — it runs on every
 * keystroke and only drives a five-segment bar. It is advisory: `passwordSchema`
 * is what actually decides whether a password is accepted.
 */
export function passwordStrength(password: string): 0 | 1 | 2 | 3 | 4 {
  const levels = [0, 1, 2, 3, 4] as const;

  if (password.length < 8) return levels[0];
  if (COMMON_PASSWORDS.has(password.toLowerCase())) return levels[0];

  let score = 0;
  if (password.length >= 10) score += 1;
  if (password.length >= 14) score += 1;
  if (password.length >= 20) score += 1;

  const classes = [CLASS_LOWER, CLASS_UPPER, CLASS_DIGIT, CLASS_SYMBOL].filter((pattern) =>
    pattern.test(password),
  ).length;
  if (classes >= 3) score += 1;
  if (classes === 4) score += 1;

  // A long string of one repeated character is long, not strong.
  if (/^(.)\1+$/.test(password)) return levels[0];
  if (/(.)\1{2,}/.test(password)) score -= 1;
  if (/(?:0123|1234|2345|3456|4567|5678|6789|abcd|qwer|azer)/i.test(password)) score -= 1;

  return levels[Math.min(Math.max(score, 0), 4)];
}

/**
 * Flattens a Zod error into the wire shape the UI binds to. Shared by forms
 * and by `src/server/api.ts` so a field error looks identical whichever side
 * produced it.
 */
/**
 * A dotted, space-free token — i.e. something that looks like a translation
 * key rather than a sentence.
 */
const LOOKS_LIKE_KEY = /^[a-z][\w-]*(\.[\w-]+)+$/i;

export function toFieldErrors(error: z.ZodError): ApiFieldError[] {
  const seen = new Set<string>();
  const fields: ApiFieldError[] = [];

  for (const issue of error.issues) {
    const field = issue.path.map((segment) => String(segment)).join(".") || "_form";
    // First message per field: forms show one error per input.
    if (seen.has(field)) continue;
    seen.add(field);

    // Every schema in this file supplies an i18n key as its message, but a
    // schema defined at a route may not — and zod's own English default would
    // then reach the client untranslated, and could echo the rejected value
    // back. Anything that is not key-shaped is replaced.
    const message = LOOKS_LIKE_KEY.test(issue.message)
      ? issue.message
      : "common.validation.invalid";

    fields.push({ field, messageKey: message });
  }

  return fields;
}
