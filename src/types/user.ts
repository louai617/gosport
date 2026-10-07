/** Identity, account and compliance-facing models. */

export type UserRole = "player" | "admin";

export type KycStatus = "not_started" | "pending" | "verified" | "rejected" | "expired";

/**
 * `pending` — invited, no password yet. `suspended` / `locked` — an
 * administrator's decision or a security lock; neither can sign in.
 * `self_excluded` — the player's own choice; can sign in, may not wager.
 */
export type AccountStatus =
  | "pending"
  | "active"
  | "suspended"
  | "locked"
  | "self_excluded"
  | "closed";

export interface User {
  id: string;
  username: string;
  displayName: string;
  email: string;
  firstName: string;
  lastName: string;
  /** E.164, e.g. +21620123456. */
  phone: string;
  /** ISO-8601 date (no time). Used for the age gate. */
  dateOfBirth: string;
  countryCode: string;
  role: UserRole;
  status: AccountStatus;
  /**
   * Set only by a compliant identity-verification provider.
   * In demo mode this is always `not_started` and the UI must say so.
   */
  kycStatus: KycStatus;
  /** The user's self-declared age confirmation — NOT a verification. */
  ageDeclaredAt: string | null;
  locale: string;
  createdAt: string;
  lastLoginAt: string | null;
  twoFactorEnabled: boolean;
  emailVerified: boolean;
  phoneVerified: boolean;
}

export interface SessionUser {
  id: string;
  username: string;
  email: string;
  displayName: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  status: AccountStatus;
  kycStatus: KycStatus;
  locale: string;
  /** True until the holder replaces an initial or administrator-set password. */
  mustChangePassword: boolean;
}

/* ----------------------------------------------------------- responsible play */

export type LimitPeriod = "daily" | "weekly" | "monthly";

export type LimitKind = "deposit" | "stake" | "loss" | "single_bet";

export interface ResponsibleGamblingLimit {
  id: string;
  userId: string;
  kind: LimitKind;
  period: LimitPeriod;
  /** Amount in TND. */
  value: number;
  /** Consumed so far in the current window. */
  used: number;
  active: boolean;
  effectiveFrom: string;
  /**
   * Increases must be delayed by a cooling-off window; decreases apply
   * immediately. Set when a pending increase is scheduled.
   */
  pendingValue: number | null;
  pendingEffectiveFrom: string | null;
}

export type ExclusionKind = "cooling_off" | "self_exclusion";

export interface SelfExclusion {
  id: string;
  userId: string;
  kind: ExclusionKind;
  startedAt: string;
  /** null = indefinite (permanent self-exclusion). */
  endsAt: string | null;
  /** Whether it has been synced to a national register (never, in demo). */
  registeredExternally: boolean;
}

/* --------------------------------------------------------------- engagement */

export type FavoriteKind = "sport" | "competition" | "team" | "event";

export interface Favorite {
  id: string;
  userId: string;
  kind: FavoriteKind;
  /** Id of the sport / competition / team / event. */
  targetId: string;
  createdAt: string;
}

export type NotificationKind =
  | "match_starting"
  | "bet_settled"
  | "promotion"
  | "account"
  | "responsible_gambling";

export interface AppNotification {
  id: string;
  userId: string;
  kind: NotificationKind;
  /** i18n keys, with `params` interpolated at render time. */
  titleKey: string;
  bodyKey: string;
  params?: Record<string, string | number>;
  href?: string;
  read: boolean;
  createdAt: string;
}
