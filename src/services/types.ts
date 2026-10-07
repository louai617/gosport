import type {
  LoginInput as ValidatedLoginInput,
  RegisterInput as ValidatedRegisterInput,
} from "@/lib/validation";
import type {
  AccountStatus,
  Bet,
  BetStatus,
  EventStatus,
  FavoriteKind,
  KycStatus,
  LimitKind,
  LimitPeriod,
  NotificationKind,
  PromotionKind,
  PromotionStatus,
  ResponsibleGamblingLimit,
  SelfExclusion,
  SessionUser,
  SportKey,
  Transaction,
  TransactionKind,
  TransactionStatus,
  Wallet,
} from "@/types";

/**
 * Service-layer contracts.
 *
 * Query shapes and result envelopes for the seam between the UI and the data
 * provider. Domain models live in `@/types` and are never redefined here.
 */

/* ------------------------------------------------------------------- search */

export interface SearchResult {
  kind: "team" | "competition" | "sport" | "event";
  id: string;
  /**
   * Text to display. Team, competition and event titles are proper nouns and
   * render as-is. For `kind: "sport"` the feed carries no display name, so
   * this is the sport's i18n key and must go through `t()`.
   */
  title: string;
  /** Translatable secondary line — takes precedence over `subtitle`. */
  subtitleKey?: string;
  /** Secondary line that is a proper noun (a competition name, say). */
  subtitle?: string;
  href: string;
  /** Extra context. For events this is the ISO-8601 kick-off time. */
  meta?: string;
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
  /** Matches found before `limit` was applied. */
  total: number;
}

/* ------------------------------------------------------------- sportsbook */

export interface EventQuery {
  sportId?: string;
  /** Convenience for route params, which carry the key rather than the id. */
  sportKey?: SportKey;
  competitionId?: string;
  countryId?: string;
  status?: EventStatus | EventStatus[];
  featured?: boolean;
  /** Inclusive lower bound on kick-off, ISO-8601. */
  fromIso?: string;
  /** Inclusive upper bound on kick-off, ISO-8601. */
  toIso?: string;
  /** Caps the result length. Ignored when `page`/`pageSize` are supplied. */
  limit?: number;
  page?: number;
  pageSize?: number;
}

export interface CompetitionQuery {
  sportId?: string;
  countryId?: string;
  popular?: boolean;
  limit?: number;
}

/* ------------------------------------------------------------------ account */

/** Envelope for every service call that changes state. */
export interface ActionResult {
  ok: boolean;
  /** i18n key — never a raw message. */
  errorKey?: string;
}

export interface AccountOverview {
  user: SessionUser;
  wallet: Wallet;
  openBetCount: number;
  totalBetCount: number;
  wonBetCount: number;
  recentBets: Bet[];
  recentTransactions: Transaction[];
  unreadNotifications: number;
}

export interface BetQuery {
  status?: BetStatus | BetStatus[];
  page?: number;
  pageSize?: number;
  fromIso?: string;
  toIso?: string;
  /** Matches the ticket reference or any selection's event label. */
  search?: string;
}

export interface NotificationQuery {
  kind?: NotificationKind | NotificationKind[];
  unreadOnly?: boolean;
  limit?: number;
}

export interface FavoriteToggleResult extends ActionResult {
  /** State after the toggle. */
  favorited: boolean;
}

/* ------------------------------------------------------- responsible gambling */

export interface LimitChangeInput {
  kind: LimitKind;
  period: LimitPeriod;
  /** Amount, or minutes for `session_duration`. */
  value: number;
}

export interface LimitChangeResult extends ActionResult {
  /**
   * A tighter limit protects the player straight away; a looser one is held
   * for the cooling-off window so the decision cannot be made in the moment.
   */
  effect: "immediate" | "scheduled";
  /** ISO-8601 instant the requested value takes effect. */
  effectiveFrom: string;
  /** Hours the increase is held. Zero when the change applies immediately. */
  coolingOffHours: number;
  /** i18n key explaining the outcome to the player. */
  messageKey: string;
  limit?: ResponsibleGamblingLimit;
}

export interface ExclusionResult extends ActionResult {
  exclusion?: SelfExclusion;
  messageKey: string;
}

/** Months, or an indefinite exclusion with no end date. */
export type SelfExclusionDuration = number | "permanent";

/* --------------------------------------------------------------------- auth */

/**
 * Auth inputs are the zod schemas' inferred types, not a parallel definition.
 *
 * Declaring them twice is how a form and its handler drift: the registration
 * form validates with `registerSchema`, so anything the service reads must be
 * a field that schema actually produces.
 */
export type RegisterInput = ValidatedRegisterInput;
export type LoginInput = ValidatedLoginInput;

/* ------------------------------------------------------------------ payments */

export interface PaymentMethodQuery {
  forDeposit?: boolean;
  forWithdrawal?: boolean;
}

export interface TransactionQuery {
  kind?: TransactionKind | TransactionKind[];
  status?: TransactionStatus | TransactionStatus[];
  page?: number;
  pageSize?: number;
  fromIso?: string;
  toIso?: string;
  /** Matches the transaction reference or description. */
  search?: string;
  sort?: string;
  direction?: "asc" | "desc";
  /** Absolute magnitude bounds, TND. */
  minAmount?: number;
  maxAmount?: number;
}

export interface MoneyMovementInput {
  methodId: string;
  amount: number;
  /** Dedupes a retried or double-clicked request. */
  idempotencyKey?: string;
}

/** What an adapter receives once the service has resolved account context. */
export interface DepositIntentInput {
  userId: string;
  methodId: string;
  amount: number;
  currency: string;
  /** Where the provider returns the player after a redirect flow. */
  returnUrl?: string;
  idempotencyKey: string;
}

export interface WithdrawalIntentInput {
  userId: string;
  methodId: string;
  amount: number;
  currency: string;
  idempotencyKey: string;
}

/* ---------------------------------------------------------------- promotions */

export interface PromotionQuery {
  status?: PromotionStatus | PromotionStatus[];
  kind?: PromotionKind | PromotionKind[];
  featured?: boolean;
  limit?: number;
}

/* --------------------------------------------------------------------- admin */

export interface AdminStats {
  registeredUsers: number;
  activeUsers24h: number;
  liveEvents: number;
  scheduledEvents: number;
  pendingTransactions: number;
  openBets: number;
  /** Sum of every simulated stake in the sandbox ledger. Not revenue. */
  totalStakeSimulated: number;
  systemStatus: "operational" | "degraded" | "maintenance";
}

export interface AdminUserQuery {
  status?: AccountStatus | AccountStatus[];
  kycStatus?: KycStatus | KycStatus[];
}

export interface AdminEventQuery {
  sportId?: string;
  status?: EventStatus | EventStatus[];
}

/** Case surfaced on the operator's responsible-gambling queue. */
export interface ResponsibleGamblingCase {
  id: string;
  userId: string;
  userName: string;
  /** i18n key for the case type, e.g. `admin.rgCase.kind.selfExclusion`. */
  kind: string;
  /** i18n key for the one-line explanation. */
  detail: string;
  createdAt: string;
  severity: "low" | "medium" | "high";
}

export interface AdminEventInput {
  sportId: string;
  competitionId: string;
  homeTeamId: string;
  awayTeamId: string;
  /** ISO-8601 kick-off. */
  startTime: string;
  status?: EventStatus;
  featured?: boolean;
}

export interface AdminPromotionInput {
  slug: string;
  kind: PromotionKind;
  titleKey: string;
  summaryKey: string;
  descriptionKey: string;
  eligibilityKeys: string[];
  termsKeys: string[];
  startsAt: string;
  endsAt: string | null;
  ctaHref: string;
  ctaLabelKey: string;
  hue: number;
  featured: boolean;
  status?: PromotionStatus;
}
