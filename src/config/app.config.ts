/**
 * SportGo — jurisdiction & runtime configuration.
 *
 * Everything market-specific lives here so the product can be re-pointed at a
 * different jurisdiction without touching feature code. Nothing in the app may
 * hard-code a currency, a legal age, a timezone or a locale.
 *
 * IMPORTANT — legal status
 * -----------------------
 * This build is a DEMONSTRATION. It is not licensed to offer gambling in
 * Tunisia or anywhere else. `compliance.licence` is intentionally null and the
 * UI is required to surface that fact. Do not set APP_MODE to "live" until
 * every entry in `compliance.requiredBeforeLaunch` is satisfied.
 */

export type AppMode = "demo" | "live";

export const APP_MODE: AppMode =
  process.env.NEXT_PUBLIC_APP_MODE === "live" ? "live" : "demo";

/** Single source of truth for "is anything on this screen real?". */
export const IS_DEMO = APP_MODE === "demo";

export interface JurisdictionConfig {
  /** ISO 3166-1 alpha-2 of the target market. */
  code: string;
  nameKey: string;
  currency: string;
  currencySymbolKey: string;
  /** BCP-47 tag used for number/date formatting fallbacks. */
  formattingLocale: string;
  timezone: string;
  legalAge: number;
  /** E.164 country calling code, without "+". */
  phoneCallingCode: string;
  /** National significant number length, used by phone validation. */
  phoneNationalLength: number;
  /** Regex for the national part (no calling code, digits only). */
  phonePattern: string;
}

export const JURISDICTION: JurisdictionConfig = {
  code: process.env.NEXT_PUBLIC_JURISDICTION ?? "TN",
  nameKey: "countries.TN",
  currency: process.env.NEXT_PUBLIC_CURRENCY ?? "TND",
  currencySymbolKey: "currency.TND",
  formattingLocale: "fr-TN",
  timezone: process.env.NEXT_PUBLIC_TIMEZONE ?? "Africa/Tunis",
  legalAge: Number(process.env.NEXT_PUBLIC_LEGAL_AGE ?? 18),
  phoneCallingCode: "216",
  phoneNationalLength: 8,
  phonePattern: "^[2-59]\\d{7}$",
};

/** Decimal places used when displaying a monetary amount. */
export const CURRENCY_DECIMALS: Record<string, number> = {
  TND: 3, // Tunisian dinar is a three-decimal currency (millimes).
  EUR: 2,
  USD: 2,
};

/**
 * The demo ledger rounds to 2 places for readability. Real money handling must
 * use the currency's true minor unit (3 for TND) and integer arithmetic.
 */
export const DEMO_DISPLAY_DECIMALS = 2;

export const BETTING_RULES = {
  minStake: 1,
  maxStake: 1000,
  maxSelectionsPerSlip: 20,
  minSelectionsForMultiple: 2,
  minSelectionsForSystem: 3,
  maxCombinedOdds: 2000,
  maxPotentialReturn: 50_000,
  /** Odds format shown by default. Others can be added later. */
  oddsFormat: "decimal" as const,
} as const;

export const RESPONSIBLE_GAMBLING = {
  /** A limit increase only takes effect after this delay. */
  limitIncreaseCoolingOffHours: 24,
  coolingOffOptionsDays: [1, 3, 7, 30] as const,
  selfExclusionOptionsMonths: [6, 12, 24] as const,
  supportUrl: "/responsible-gambling",
} as const;

export const compliance = {
  /**
   * Populated only when an operating licence has actually been granted.
   * Rendering any licence number that is not real would be a serious
   * misrepresentation, so this stays null in the demo build.
   */
  licence: null as null | {
    authority: string;
    number: string;
    issuedAt: string;
    verifyUrl: string;
  },

  /**
   * Gates that must be closed before `APP_MODE=live`. The demo banner and the
   * /responsible-gambling page both read from this list.
   */
  requiredBeforeLaunch: [
    "gambling_licence",
    // Casino content is a separate licence class almost everywhere. A
    // sports-betting permission does not extend to games, and the two are
    // listed apart so nobody reads one as covering the other.
    "casino_licence_class",
    "certified_rng_and_game_testing",
    "age_verification_provider",
    "kyc_aml_provider",
    "sanctions_pep_screening",
    "licensed_payment_provider",
    "national_self_exclusion_register",
    "player_funds_segregation",
    "advertising_and_promotion_review",
    "data_protection_registration",
    "tax_and_reporting_integration",
    "certified_odds_and_settlement_engine",
    "independent_platform_audit",
  ] as const,
} as const;

export const SUPPORT = {
  email: "support@sportgo.example",
  helplineKey: "responsible.helplinePlaceholder",
  hoursKey: "support.hours",
} as const;

export const APP = {
  name: "SportGo",
  tagline: "tagline",
  url: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  mode: APP_MODE,
  isDemo: IS_DEMO,
} as const;
