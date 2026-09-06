import { z } from "zod";

/**
 * Server environment.
 *
 * Parsed once, at module load, so a misconfigured deployment fails at boot
 * rather than half-way through a request. Everything here is server-only:
 * this module must never be imported from a client component. Client code
 * reads the public, `NEXT_PUBLIC_`-prefixed values from
 * `src/config/app.config.ts`, which is the only place that surface is exposed.
 */

if (typeof window !== "undefined") {
  throw new Error(
    "src/server/env.ts was imported into a client bundle. Use src/config/app.config.ts instead.",
  );
}

/**
 * `.env` files produce empty strings for keys that are present but unset
 * (`SESSION_SECRET=`). Treating those as "absent" is what an operator means,
 * and it keeps `.optional()` from firing a length error on "".
 */
function present(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

const secret = z.string().min(32, "must be at least 32 characters");
const url = z.url("must be an absolute http(s) URL");

const baseSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  /* ------------------------------------------------------------------ mode */
  APP_MODE: z.enum(["demo", "live"]).default("demo"),
  APP_URL: url.default("http://localhost:3000"),

  /* ---------------------------------------------------------- jurisdiction */
  JURISDICTION: z.string().length(2).default("TN"),
  DEFAULT_LOCALE: z.string().min(2).max(5).default("fr"),
  CURRENCY: z.string().length(3).default("TND"),
  TIMEZONE: z.string().min(3).default("Africa/Tunis"),
  LEGAL_AGE: z.coerce.number().int().min(18).max(25).default(18),

  /* -------------------------------------------------------------- storage */
  DATABASE_URL: z.string().min(1).optional(),

  /* ------------------------------------------------------------- sessions */
  SESSION_SECRET: secret.optional(),
  SESSION_COOKIE_NAME: z.string().min(1).default("sportgo_session"),
  /** Idle timeout: a session dies this long after the last request. */
  SESSION_TTL_SECONDS: z.coerce.number().int().min(300).max(86_400).default(3600),
  /** Absolute timeout: a session dies this long after issue, however active. */
  SESSION_ABSOLUTE_TTL_SECONDS: z.coerce
    .number()
    .int()
    .min(3600)
    .max(2_592_000)
    .default(86_400),
  CSRF_COOKIE_NAME: z.string().min(1).default("sportgo_csrf"),

  /**
   * Salt for the one-way hashing of IP addresses and email addresses in logs
   * and rate-limit keys. Rotating it invalidates existing rate-limit buckets,
   * which is acceptable; it must never be logged or sent to a client.
   */
  PII_HASH_SALT: z.string().min(16).optional(),

  /* ------------------------------------------ regulated provider adapters */
  SPORTS_FEED_PROVIDER: z.string().default("mock"),
  SPORTS_FEED_BASE_URL: url.optional(),
  SPORTS_FEED_API_KEY: z.string().min(8).optional(),

  PAYMENT_PROVIDER: z.string().default("mock"),
  PAYMENT_PROVIDER_BASE_URL: url.optional(),
  PAYMENT_PROVIDER_API_KEY: z.string().min(8).optional(),
  PAYMENT_PROVIDER_WEBHOOK_SECRET: secret.optional(),

  KYC_PROVIDER: z.string().default("mock"),
  KYC_PROVIDER_BASE_URL: url.optional(),
  KYC_PROVIDER_API_KEY: z.string().min(8).optional(),

  SELF_EXCLUSION_REGISTER_URL: url.optional(),
  SELF_EXCLUSION_REGISTER_API_KEY: z.string().min(8).optional(),

  /* ------------------------------------------------------------- licence */
  /**
   * Only ever set once a regulator has actually granted a licence. The demo
   * build leaves these empty and `compliance.licence` in app.config stays null.
   */
  LICENCE_AUTHORITY: z.string().min(2).optional(),
  LICENCE_NUMBER: z.string().min(2).optional(),
  LICENCE_VERIFY_URL: url.optional(),
});

/**
 * Everything a live deployment must have before it may take a single wager.
 * Each entry maps one required variable to the launch gate in
 * `compliance.requiredBeforeLaunch` that it satisfies.
 */
const LIVE_REQUIREMENTS: ReadonlyArray<{
  key: keyof z.infer<typeof baseSchema>;
  gate: string;
}> = [
  { key: "DATABASE_URL", gate: "player_funds_segregation" },
  { key: "SESSION_SECRET", gate: "independent_platform_audit" },
  { key: "PII_HASH_SALT", gate: "data_protection_registration" },
  { key: "SPORTS_FEED_BASE_URL", gate: "certified_odds_and_settlement_engine" },
  { key: "SPORTS_FEED_API_KEY", gate: "certified_odds_and_settlement_engine" },
  { key: "PAYMENT_PROVIDER_BASE_URL", gate: "licensed_payment_provider" },
  { key: "PAYMENT_PROVIDER_API_KEY", gate: "licensed_payment_provider" },
  { key: "PAYMENT_PROVIDER_WEBHOOK_SECRET", gate: "licensed_payment_provider" },
  { key: "KYC_PROVIDER_BASE_URL", gate: "kyc_aml_provider" },
  { key: "KYC_PROVIDER_API_KEY", gate: "kyc_aml_provider" },
  { key: "SELF_EXCLUSION_REGISTER_URL", gate: "national_self_exclusion_register" },
  { key: "SELF_EXCLUSION_REGISTER_API_KEY", gate: "national_self_exclusion_register" },
  { key: "LICENCE_AUTHORITY", gate: "gambling_licence" },
  { key: "LICENCE_NUMBER", gate: "gambling_licence" },
  { key: "LICENCE_VERIFY_URL", gate: "gambling_licence" },
];

const envSchema = baseSchema.superRefine((value, ctx) => {
  if (value.APP_MODE !== "live") return;

  for (const { key, gate } of LIVE_REQUIREMENTS) {
    if (value[key] === undefined) {
      ctx.addIssue({
        code: "custom",
        path: [key],
        message: `required when APP_MODE=live (launch gate: ${gate})`,
      });
    }
  }

  // A "mock" adapter in live mode would silently fabricate odds or payments —
  // the single most dangerous misconfiguration this product can have.
  for (const key of ["SPORTS_FEED_PROVIDER", "PAYMENT_PROVIDER", "KYC_PROVIDER"] as const) {
    if (value[key] === "mock") {
      ctx.addIssue({
        code: "custom",
        path: [key],
        message: "must not be 'mock' when APP_MODE=live",
      });
    }
  }
});

const rawEnv = {
  NODE_ENV: present(process.env.NODE_ENV),

  APP_MODE: present(process.env.NEXT_PUBLIC_APP_MODE),
  APP_URL: present(process.env.NEXT_PUBLIC_APP_URL),

  JURISDICTION: present(process.env.NEXT_PUBLIC_JURISDICTION),
  DEFAULT_LOCALE: present(process.env.NEXT_PUBLIC_DEFAULT_LOCALE),
  CURRENCY: present(process.env.NEXT_PUBLIC_CURRENCY),
  TIMEZONE: present(process.env.NEXT_PUBLIC_TIMEZONE),
  LEGAL_AGE: present(process.env.NEXT_PUBLIC_LEGAL_AGE),

  DATABASE_URL: present(process.env.DATABASE_URL),

  SESSION_SECRET: present(process.env.SESSION_SECRET),
  SESSION_COOKIE_NAME: present(process.env.SESSION_COOKIE_NAME),
  SESSION_TTL_SECONDS: present(process.env.SESSION_TTL_SECONDS),
  SESSION_ABSOLUTE_TTL_SECONDS: present(process.env.SESSION_ABSOLUTE_TTL_SECONDS),
  CSRF_COOKIE_NAME: present(process.env.CSRF_COOKIE_NAME),
  PII_HASH_SALT: present(process.env.PII_HASH_SALT),

  SPORTS_FEED_PROVIDER: present(process.env.SPORTS_FEED_PROVIDER),
  SPORTS_FEED_BASE_URL: present(process.env.SPORTS_FEED_BASE_URL),
  SPORTS_FEED_API_KEY: present(process.env.SPORTS_FEED_API_KEY),

  PAYMENT_PROVIDER: present(process.env.PAYMENT_PROVIDER),
  PAYMENT_PROVIDER_BASE_URL: present(process.env.PAYMENT_PROVIDER_BASE_URL),
  PAYMENT_PROVIDER_API_KEY: present(process.env.PAYMENT_PROVIDER_API_KEY),
  PAYMENT_PROVIDER_WEBHOOK_SECRET: present(process.env.PAYMENT_PROVIDER_WEBHOOK_SECRET),

  KYC_PROVIDER: present(process.env.KYC_PROVIDER),
  KYC_PROVIDER_BASE_URL: present(process.env.KYC_PROVIDER_BASE_URL),
  KYC_PROVIDER_API_KEY: present(process.env.KYC_PROVIDER_API_KEY),

  SELF_EXCLUSION_REGISTER_URL: present(process.env.SELF_EXCLUSION_REGISTER_URL),
  SELF_EXCLUSION_REGISTER_API_KEY: present(process.env.SELF_EXCLUSION_REGISTER_API_KEY),

  LICENCE_AUTHORITY: present(process.env.LICENCE_AUTHORITY),
  LICENCE_NUMBER: present(process.env.LICENCE_NUMBER),
  LICENCE_VERIFY_URL: present(process.env.LICENCE_VERIFY_URL),
};

function parseEnv(): z.infer<typeof envSchema> {
  const result = envSchema.safeParse(rawEnv);
  if (result.success) return result.data;

  const lines = result.error.issues.map((issue) => {
    const name = issue.path.join(".") || "(root)";
    return `  - ${name}: ${issue.message}`;
  });

  throw new Error(
    [
      "Invalid environment configuration. Fix the following before starting:",
      ...lines,
      "",
      "See .env.example for the full list and copy it to .env.local.",
    ].join("\n"),
  );
}

export const env = parseEnv();

export type Env = typeof env;

/** True whenever nothing on screen or in the ledger is real. */
export const isDemo = env.APP_MODE === "demo";
export const isProduction = env.NODE_ENV === "production";

/**
 * Salt used for one-way PII hashing. Falls back to the session secret, then to
 * a fixed development string — acceptable only because demo mode has no real
 * users. `LIVE_REQUIREMENTS` makes `PII_HASH_SALT` mandatory before launch.
 */
export const piiHashSalt: string =
  env.PII_HASH_SALT ?? env.SESSION_SECRET ?? "sportgo-demo-salt-not-for-production";
