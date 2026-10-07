import { z } from "zod";

import {
  amountSchema,
  countrySchema,
  displayNameSchema,
  emailSchema,
  localeSchema,
  nameSchema,
  passwordSchema,
  phoneSchema,
  usernameSchema,
} from "@/lib/validation";

/**
 * Validation for administrative operations.
 *
 * Same contract as `validation.ts`: every message is an i18n key, and the schema
 * is re-run on the server regardless of what the browser did. Money is parsed
 * here as a decimal number and converted to integer millimes (`toMillimes`) only
 * after validation, in the service.
 */

const idSchema = z
  .string()
  .trim()
  .min(1, { message: "common.validation.required" })
  .max(64, { message: "common.validation.tooLong" })
  .regex(/^[A-Za-z0-9_-]+$/, { message: "common.validation.invalid" });

const CONTROL = /[\u0000-\u001F\u007F-\u009F​-‏‪-‮⁦-⁩]/g;

/** Free text an operator writes: stripped of control/bidi characters, bounded. */
export function freeText(min: number, max: number, requiredKey = "admin.validation.reasonRequired") {
  return z
    .string({ message: requiredKey })
    .transform((value) => value.replace(CONTROL, "").replace(/\s+/g, " ").trim())
    .pipe(
      z
        .string()
        .min(min, { message: requiredKey })
        .max(max, { message: "common.validation.tooLong" }),
    );
}

export const reasonSchema = freeText(5, 500);

const referenceSchema = z
  .string()
  .trim()
  .max(64, { message: "common.validation.tooLong" })
  .regex(/^[\p{L}\p{N} ._/#:-]*$/u, { message: "common.validation.invalid" })
  .optional()
  .transform((value) => (value ? value : undefined));

const idempotencyKey = z.string().trim().min(8).max(128).optional();

export const MANUAL_TYPES = [
  "ADMIN_CREDIT",
  "ADMIN_DEBIT",
  "DEPOSIT",
  "WITHDRAWAL",
  "BONUS",
  "REFUND",
  "ADJUSTMENT",
] as const;

export const adjustmentSchema = z
  .object({
    playerId: idSchema,
    type: z.enum(MANUAL_TYPES, { message: "admin.validation.typeInvalid" }),
    /** Only meaningful for ADJUSTMENT, which can go either way. */
    direction: z.enum(["credit", "debit"]).optional(),
    amount: amountSchema,
    reason: reasonSchema,
    reference: referenceSchema,
    /** Money movements need an explicit yes, not just a click on a submit button. */
    confirm: z.literal(true, { message: "admin.validation.confirmRequired" }),
    idempotencyKey,
  })
  .refine((value) => value.type !== "ADJUSTMENT" || value.direction !== undefined, {
    message: "admin.validation.directionRequired",
    path: ["direction"],
  });

export type AdjustmentInput = z.infer<typeof adjustmentSchema>;

export const decisionSchema = z.object({
  id: idSchema,
  decision: z.enum(["approve", "reject"]),
  note: freeText(0, 300, "admin.validation.reasonRequired").optional(),
});

export const createPlayerSchema = z
  .object({
    username: usernameSchema,
    email: emailSchema,
    phone: z
      .string()
      .trim()
      .optional()
      .transform((value) => (value ? value : undefined))
      .pipe(phoneSchema.optional()),
    firstName: nameSchema,
    lastName: nameSchema,
    country: countrySchema,
    locale: localeSchema.default("fr"),
    credentialMode: z.enum(["invitation", "password"], {
      message: "admin.validation.credentialModeInvalid",
    }),
    /** Only read when `credentialMode` is "password". */
    temporaryPassword: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.credentialMode !== "password") return;
    const parsed = passwordSchema.safeParse(value.temporaryPassword ?? "");
    if (!parsed.success) {
      ctx.addIssue({
        code: "custom",
        path: ["temporaryPassword"],
        message: parsed.error.issues[0]?.message ?? "auth.validation.passwordRequired",
      });
    }
  });

export type CreatePlayerInput = z.infer<typeof createPlayerSchema>;

export const updatePlayerSchema = z.object({
  playerId: idSchema,
  email: emailSchema,
  phone: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value : undefined))
    .pipe(phoneSchema.optional()),
  firstName: nameSchema,
  lastName: nameSchema,
  displayName: displayNameSchema,
  country: countrySchema,
  locale: localeSchema,
  reason: reasonSchema,
});

export type UpdatePlayerInput = z.infer<typeof updatePlayerSchema>;

export const playerActionSchema = z.object({
  playerId: idSchema,
  reason: reasonSchema,
  confirm: z.literal(true, { message: "admin.validation.confirmRequired" }),
});

export const restrictionsSchema = z.object({
  playerId: idSchema,
  wageringBlocked: z.boolean(),
  withdrawalsBlocked: z.boolean(),
  reason: reasonSchema,
});

export const verificationSchema = z.object({
  playerId: idSchema,
  status: z.enum(["NOT_STARTED", "PENDING", "VERIFIED", "REJECTED", "EXPIRED"]),
  reason: reasonSchema,
});

export const settleBetSchema = z.object({
  betId: idSchema,
  results: z.record(idSchema, z.enum(["WON", "LOST", "VOID"])),
  confirm: z.literal(true, { message: "admin.validation.confirmRequired" }),
});

/* --------------------------------------------------------------- list filters */

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "common.validation.invalid" })
  .optional();

export const PERIOD_PRESETS = [
  "today",
  "yesterday",
  "last7",
  "last30",
  "thisMonth",
  "lastMonth",
  "custom",
] as const;

export type PeriodPreset = (typeof PERIOD_PRESETS)[number];

export const periodQuerySchema = z.object({
  period: z.enum(PERIOD_PRESETS).optional().default("last7"),
  from: isoDate,
  to: isoDate,
});

export type PeriodQuery = z.infer<typeof periodQuerySchema>;
