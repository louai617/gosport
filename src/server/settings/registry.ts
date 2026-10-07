import { RESPONSIBLE_GAMBLING } from "@/config/app.config";

/**
 * The settings the platform actually honours.
 *
 * This list is the single source of truth three times over: it types
 * `getSetting`, it validates every write, and the admin Settings screen is
 * *generated from it* — so a setting that is not enforced by the backend cannot
 * appear in the UI, because there is nowhere else to declare one.
 *
 * Money values are in TND (up to three decimals) here and converted to millimes
 * where they are applied.
 */

export type SettingGroup = "general" | "players" | "wallet" | "security" | "responsible";

interface Base<K extends string> {
  key: K;
  group: SettingGroup;
}

export interface BooleanSetting<K extends string = string> extends Base<K> {
  type: "boolean";
  default: boolean;
}

export interface NumberSetting<K extends string = string> extends Base<K> {
  type: "integer" | "money";
  default: number;
  min: number;
  max: number;
}

export interface MultiSetting<K extends string = string> extends Base<K> {
  type: "multi";
  default: readonly string[];
  options: readonly string[];
}

export type SettingDefinition = BooleanSetting | NumberSetting | MultiSetting;

/** Ledger types an administrator may post by hand. */
export const MANUAL_TRANSACTION_TYPES = [
  "ADMIN_CREDIT",
  "ADMIN_DEBIT",
  "DEPOSIT",
  "WITHDRAWAL",
  "BONUS",
  "REFUND",
  "ADJUSTMENT",
] as const;

export type ManualTransactionType = (typeof MANUAL_TRANSACTION_TYPES)[number];

export const SETTING_DEFINITIONS = [
  /* general */
  { key: "general.maintenanceMode", group: "general", type: "boolean", default: false },

  /* players */
  { key: "players.registrationEnabled", group: "players", type: "boolean", default: true },
  {
    key: "players.requireVerificationToWager",
    group: "players",
    type: "boolean",
    default: false,
  },

  /* wallet */
  {
    key: "wallet.minTransactionAmount",
    group: "wallet",
    type: "money",
    default: 1,
    min: 0.001,
    max: 1_000_000,
  },
  {
    key: "wallet.maxTransactionAmount",
    group: "wallet",
    type: "money",
    default: 50_000,
    min: 1,
    max: 1_000_000,
  },
  {
    key: "wallet.maxAdjustmentAmount",
    group: "wallet",
    type: "money",
    default: 10_000,
    min: 1,
    max: 1_000_000,
  },
  {
    key: "wallet.adjustmentApprovalThreshold",
    group: "wallet",
    type: "money",
    default: 0,
    min: 0,
    max: 1_000_000,
  },
  {
    key: "wallet.allowedAdjustmentTypes",
    group: "wallet",
    type: "multi",
    default: MANUAL_TRANSACTION_TYPES,
    options: MANUAL_TRANSACTION_TYPES,
  },
  {
    key: "wallet.largeTransactionAlert",
    group: "wallet",
    type: "money",
    default: 1_000,
    min: 0,
    max: 1_000_000,
  },

  /* security */
  { key: "security.maxFailedLogins", group: "security", type: "integer", default: 5, min: 3, max: 20 },
  {
    key: "security.lockoutMinutes",
    group: "security",
    type: "integer",
    default: 15,
    min: 1,
    max: 1440,
  },
  {
    key: "security.passwordMinLength",
    group: "security",
    type: "integer",
    default: 10,
    min: 10,
    max: 64,
  },
  { key: "security.passwordRequireSymbol", group: "security", type: "boolean", default: false },

  /* responsible gambling */
  {
    key: "responsible.limitIncreaseCoolingOffHours",
    group: "responsible",
    type: "integer",
    default: RESPONSIBLE_GAMBLING.limitIncreaseCoolingOffHours,
    min: 0,
    max: 720,
  },
] as const satisfies readonly SettingDefinition[];

export type SettingKey = (typeof SETTING_DEFINITIONS)[number]["key"];

type DefinitionOf<K extends SettingKey> = Extract<(typeof SETTING_DEFINITIONS)[number], { key: K }>;

export type SettingValue<K extends SettingKey> =
  DefinitionOf<K> extends { type: "boolean" }
    ? boolean
    : DefinitionOf<K> extends { type: "multi" }
      ? string[]
      : number;

export const SETTING_BY_KEY: ReadonlyMap<string, SettingDefinition> = new Map(
  SETTING_DEFINITIONS.map((definition) => [definition.key, definition]),
);

export const SETTING_GROUPS: readonly SettingGroup[] = [
  "general",
  "players",
  "wallet",
  "security",
  "responsible",
];
