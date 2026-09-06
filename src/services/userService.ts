import { JURISDICTION, RESPONSIBLE_GAMBLING } from "@/config/app.config";
import { getDataset } from "@/data";
import type {
  AppNotification,
  Bet,
  Favorite,
  FavoriteKind,
  Paginated,
  ResponsibleGamblingLimit,
  SelfExclusion,
  SessionUser,
  Transaction,
  User,
} from "@/types";
import type {
  AccountOverview,
  ActionResult,
  BetQuery,
  ExclusionResult,
  FavoriteToggleResult,
  LimitChangeInput,
  LimitChangeResult,
  LoginInput,
  NotificationQuery,
  RegisterInput,
  SelfExclusionDuration,
} from "./types";
import { asArray, containsNormalised, paginate } from "./utils";

/**
 * Account, engagement and responsible-gambling reads.
 *
 * ── NO REAL ACCOUNTS ──────────────────────────────────────────────────────
 * There is no user store, no password hash and no identity check in this
 * module. The session is a marker cookie, the player is a fixture from the
 * generated dataset, and every write computes its outcome and hands it back
 * without persisting: the dataset is rebuilt per time bucket on both the
 * server and the client, so state parked inside it would disagree across a
 * hydration boundary. Callers apply the returned state optimistically.
 * ──────────────────────────────────────────────────────────────────────────
 */

/**
 * Marker cookie standing in for a session. Exported because a service cannot
 * set cookies — the sign-in route handler owns that — and both sides have to
 * agree on the name.
 */
export const DEMO_SESSION_COOKIE = "sportgo_demo_session";

/** Rows shown by the account dashboard's "recent activity" panels. */
const RECENT_ROWS = 5;

const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

const COOLING_OFF_DAYS: readonly number[] = RESPONSIBLE_GAMBLING.coolingOffOptionsDays;
const EXCLUSION_MONTHS: readonly number[] = RESPONSIBLE_GAMBLING.selfExclusionOptionsMonths;

/** Display order for the limits panel, tightest-scoped control first. */
const LIMIT_ORDER: Record<ResponsibleGamblingLimit["kind"], number> = {
  deposit: 0,
  stake: 1,
  loss: 2,
  single_bet: 3,
  session_duration: 4,
};

/* -------------------------------------------------------------------- session */

/**
 * `next/headers` is imported lazily so this module can sit in the services
 * barrel without pulling a request-scoped API into a client bundle, and the
 * call is guarded because `cookies()` throws outside a request scope — during
 * a build-time prerender, for one — where "signed out" is the right answer.
 */
async function hasDemoSession(): Promise<boolean> {
  if (typeof window !== "undefined") return false;

  try {
    const { cookies } = await import("next/headers");
    const store = await cookies();
    return store.get(DEMO_SESSION_COOKIE) !== undefined;
  } catch {
    return false;
  }
}

function toSessionUser(user: User): SessionUser {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    status: user.status,
    kycStatus: user.kycStatus,
    locale: user.locale,
  };
}

/** The signed-in player, or `null` when the demo session cookie is absent. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  if (!(await hasDemoSession())) return null;
  return toSessionUser(getDataset().demoUser);
}

/**
 * The fixture player, session or not. Account, wallet and bet-history screens
 * use this so the signed-in shell can be reviewed without a sign-in step;
 * anything that must respect the session asks `getCurrentUser` instead.
 */
export async function getDemoUser(): Promise<SessionUser> {
  return toSessionUser(getDataset().demoUser);
}

/**
 * The full profile record.
 *
 * Separate from `getDemoUser` on purpose: `SessionUser` is deliberately narrow
 * so a session payload never carries a date of birth or a phone number around
 * the app. Only the profile and security screens need the whole record, and
 * they ask for it explicitly.
 */
export async function getUserProfile(): Promise<User> {
  return getDataset().demoUser;
}

/* -------------------------------------------------------------------- account */

export async function getAccountOverview(): Promise<AccountOverview> {
  const dataset = getDataset();
  const bets = [...dataset.bets].sort(byPlacedAtDesc);
  const transactions = [...dataset.transactions].sort(byCreatedAtDesc);

  return {
    user: toSessionUser(dataset.demoUser),
    wallet: dataset.wallet,
    openBetCount: bets.filter(isOpenBet).length,
    totalBetCount: bets.length,
    wonBetCount: bets.filter((bet) => bet.status === "won").length,
    recentBets: bets.slice(0, RECENT_ROWS),
    recentTransactions: transactions.slice(0, RECENT_ROWS),
    unreadNotifications: dataset.notifications.filter((entry) => !entry.read).length,
  };
}

/* ----------------------------------------------------------------------- bets */

function isOpenBet(bet: Bet): boolean {
  return bet.status === "pending";
}

function byPlacedAtDesc(a: Bet, b: Bet): number {
  return Date.parse(b.placedAt) - Date.parse(a.placedAt);
}

function byCreatedAtDesc(a: Transaction, b: Transaction): number {
  return Date.parse(b.createdAt) - Date.parse(a.createdAt);
}

/** A ticket is found by its reference or by any fixture printed on it. */
function betMatches(bet: Bet, search: string): boolean {
  if (containsNormalised(bet.reference, search)) return true;
  return bet.selections.some(
    (selection) =>
      containsNormalised(selection.eventLabel, search) ||
      containsNormalised(selection.competitionLabel, search),
  );
}

export async function getBets(query: BetQuery = {}): Promise<Paginated<Bet>> {
  const statuses = asArray(query.status);
  const fromMs = query.fromIso ? Date.parse(query.fromIso) : undefined;
  const toMs = query.toIso ? Date.parse(query.toIso) : undefined;
  const search = query.search?.trim();

  const matched = getDataset().bets.filter((bet) => {
    if (statuses.length > 0 && !statuses.includes(bet.status)) return false;

    const placedMs = Date.parse(bet.placedAt);
    if (fromMs !== undefined && placedMs < fromMs) return false;
    if (toMs !== undefined && placedMs > toMs) return false;

    return !search || betMatches(bet, search);
  });

  matched.sort(byPlacedAtDesc);
  return paginate(matched, query.page, query.pageSize);
}

export async function getOpenBets(): Promise<Bet[]> {
  return getDataset().bets.filter(isOpenBet).sort(byPlacedAtDesc);
}

export async function getBetById(id: string): Promise<Bet | null> {
  return getDataset().bets.find((bet) => bet.id === id) ?? null;
}

/* -------------------------------------------------------------- notifications */

export async function getNotifications(
  query: NotificationQuery = {},
): Promise<AppNotification[]> {
  const kinds = asArray(query.kind);

  const matched = getDataset().notifications.filter((notification) => {
    if (kinds.length > 0 && !kinds.includes(notification.kind)) return false;
    return !(query.unreadOnly && notification.read);
  });

  matched.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return query.limit !== undefined ? matched.slice(0, Math.max(0, query.limit)) : matched;
}

/**
 * Acknowledges a notification. The read flag is not written back — the caller
 * owns the optimistic update — but an unknown id still fails so a broken link
 * in the UI surfaces instead of passing silently.
 */
export async function markNotificationRead(id: string): Promise<ActionResult> {
  const exists = getDataset().notifications.some((notification) => notification.id === id);
  return exists ? { ok: true } : { ok: false, errorKey: "error.generic" };
}

export async function markAllNotificationsRead(): Promise<ActionResult> {
  return { ok: true };
}

/* ------------------------------------------------------------------ favorites */

export async function getFavorites(): Promise<Favorite[]> {
  return [...getDataset().favorites].sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
  );
}

/** Returns the state the caller should render, which is the inverse of the current one. */
export async function toggleFavorite(
  kind: FavoriteKind,
  targetId: string,
): Promise<FavoriteToggleResult> {
  const existing = getDataset().favorites.some(
    (favorite) => favorite.kind === kind && favorite.targetId === targetId,
  );
  return { ok: true, favorited: !existing };
}

/* ------------------------------------------------------- responsible gambling */

export async function getResponsibleGamblingLimits(): Promise<ResponsibleGamblingLimit[]> {
  return [...getDataset().limits].sort(
    (a, b) => LIMIT_ORDER[a.kind] - LIMIT_ORDER[b.kind],
  );
}

/**
 * Applies the one asymmetry that matters in a limits tool: a tighter limit
 * protects the player the moment they ask for it, while a looser one is held
 * for the cooling-off window so the decision cannot be made in the moment it
 * is regretted. Setting a first limit counts as protective and is immediate.
 *
 * The caller renders `messageKey` with `{ hours: coolingOffHours }`.
 */
export async function requestLimitChange(
  input: LimitChangeInput,
): Promise<LimitChangeResult> {
  const dataset = getDataset();
  const nowIso = new Date(dataset.nowMs).toISOString();

  if (!Number.isFinite(input.value) || input.value <= 0) {
    return {
      ok: false,
      errorKey: "responsible.validation.valueTooLow",
      effect: "immediate",
      effectiveFrom: nowIso,
      coolingOffHours: 0,
      messageKey: "responsible.validation.valueTooLow",
    };
  }

  const current = dataset.limits.find(
    (limit) => limit.kind === input.kind && limit.period === input.period,
  );
  const isIncrease = current !== undefined && current.active && input.value > current.value;

  const coolingOffHours = isIncrease ? RESPONSIBLE_GAMBLING.limitIncreaseCoolingOffHours : 0;
  const effectiveFrom = isIncrease
    ? new Date(dataset.nowMs + coolingOffHours * MS_PER_HOUR).toISOString()
    : nowIso;

  const limit: ResponsibleGamblingLimit = current
    ? {
        ...current,
        active: true,
        value: isIncrease ? current.value : input.value,
        effectiveFrom: isIncrease ? current.effectiveFrom : nowIso,
        pendingValue: isIncrease ? input.value : null,
        pendingEffectiveFrom: isIncrease ? effectiveFrom : null,
      }
    : {
        id: `limit-${input.kind}-${input.period}`,
        userId: dataset.demoUser.id,
        kind: input.kind,
        period: input.period,
        value: input.value,
        used: 0,
        active: true,
        effectiveFrom: nowIso,
        pendingValue: null,
        pendingEffectiveFrom: null,
      };

  return {
    ok: true,
    effect: isIncrease ? "scheduled" : "immediate",
    effectiveFrom,
    coolingOffHours,
    messageKey: isIncrease
      ? "responsible.limits.increaseDelayed"
      : "responsible.limits.decreaseImmediate",
    limit,
  };
}

export async function getSelfExclusions(): Promise<SelfExclusion[]> {
  return [...getDataset().exclusions].sort(
    (a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt),
  );
}

/**
 * A short, self-reversing pause. Only the durations offered by the UI are
 * accepted — an arbitrary value would mean the copy explaining the pause no
 * longer describes what was applied.
 */
export async function requestCoolingOff(days: number): Promise<ExclusionResult> {
  if (!COOLING_OFF_DAYS.includes(days)) {
    return {
      ok: false,
      errorKey: "responsible.validation.durationUnsupported",
      messageKey: "responsible.validation.durationUnsupported",
    };
  }

  const dataset = getDataset();
  return {
    ok: true,
    messageKey: "responsible.demoNote",
    exclusion: {
      id: `exclusion-cooling-off-${days}`,
      userId: dataset.demoUser.id,
      kind: "cooling_off",
      startedAt: new Date(dataset.nowMs).toISOString(),
      endsAt: new Date(dataset.nowMs + days * MS_PER_DAY).toISOString(),
      registeredExternally: false,
    },
  };
}

/**
 * Adds whole calendar months. A day-of-month that does not exist in the target
 * month rolls forward (31 Jan + 1 month → 3 Mar); a licensed implementation
 * clamps to the last day instead, since an exclusion may never end early.
 */
function addMonths(fromMs: number, months: number): string {
  const date = new Date(fromMs);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString();
}

/**
 * The strongest tool the account offers, and the one a live deployment must
 * mirror to the national self-exclusion register before it counts as honoured
 * — `registeredExternally` stays false here because no register is connected.
 */
export async function requestSelfExclusion(
  duration: SelfExclusionDuration,
): Promise<ExclusionResult> {
  if (duration !== "permanent" && !EXCLUSION_MONTHS.includes(duration)) {
    return {
      ok: false,
      errorKey: "responsible.validation.durationUnsupported",
      messageKey: "responsible.validation.durationUnsupported",
    };
  }

  const dataset = getDataset();
  return {
    ok: true,
    messageKey: "responsible.demoNote",
    exclusion: {
      id: `exclusion-self-${duration}`,
      userId: dataset.demoUser.id,
      kind: "self_exclusion",
      startedAt: new Date(dataset.nowMs).toISOString(),
      endsAt: duration === "permanent" ? null : addMonths(dataset.nowMs, duration),
      registeredExternally: false,
    },
  };
}

/* ----------------------------------------------------------------- auth stubs */

/**
 * Age from calendar components in UTC, so a player never gains or loses a day
 * to a timezone offset. Mirrors `dateOfBirthSchema` in `@/lib/validation`,
 * which checks the same thing at the form boundary — the form is never the
 * authority, so the check is repeated here.
 */
function declaredAge(isoDate: string, referenceMs: number): number {
  const [year, month, day] = isoDate.split("-").map(Number);
  if (!year || !month || !day) return Number.NaN;

  const reference = new Date(referenceMs);
  const beforeBirthday =
    reference.getUTCMonth() + 1 < month ||
    (reference.getUTCMonth() + 1 === month && reference.getUTCDate() < day);
  return reference.getUTCFullYear() - year - (beforeBirthday ? 1 : 0);
}

/**
 * Demo stub. No account is created: nothing is written, no password is hashed,
 * no email is sent and — the part that matters — no identity or age
 * verification takes place. `ageConfirmed` is a box an anonymous visitor
 * ticked; before any account could stake or deposit, a licensed provider has
 * to confirm the date of birth against an authoritative source and the account
 * has to stay gated until `kycStatus === "verified"`.
 */
export async function register(input: RegisterInput): Promise<ActionResult> {
  if (!input.firstName.trim() || !input.lastName.trim()) {
    return { ok: false, errorKey: "auth.validation.nameRequired" };
  }
  if (!input.email.trim()) return { ok: false, errorKey: "auth.validation.emailRequired" };
  if (!input.password) return { ok: false, errorKey: "auth.validation.passwordRequired" };
  if (!input.ageConfirmed) {
    return { ok: false, errorKey: "auth.validation.ageConfirmRequired" };
  }
  if (!input.termsAccepted) return { ok: false, errorKey: "auth.validation.termsRequired" };

  const age = declaredAge(input.dateOfBirth, getDataset().nowMs);
  if (!Number.isFinite(age) || age < JURISDICTION.legalAge) {
    return { ok: false, errorKey: "auth.validation.dobUnderage" };
  }

  return { ok: true };
}

/**
 * Demo stub. There is no credential store, so nothing is authenticated: any
 * well-formed pair is accepted and the caller — a route handler, since a
 * service cannot write cookies — issues `DEMO_SESSION_COOKIE`.
 */
export async function login(input: LoginInput): Promise<ActionResult> {
  if (!input.email.trim()) return { ok: false, errorKey: "auth.validation.emailRequired" };
  if (!input.password) return { ok: false, errorKey: "auth.validation.passwordRequired" };
  return { ok: true };
}

/** Demo stub. The caller clears `DEMO_SESSION_COOKIE`; there is no server state to end. */
export async function logout(): Promise<ActionResult> {
  return { ok: true };
}

/**
 * Demo stub. No mail is sent and no token is minted. The response is identical
 * whether or not the address is known, which is the behaviour a real
 * implementation also needs: a different answer per address turns the endpoint
 * into an account-enumeration oracle.
 */
export async function requestPasswordReset(email: string): Promise<ActionResult> {
  if (!email.trim()) return { ok: false, errorKey: "auth.validation.emailRequired" };
  return { ok: true };
}
