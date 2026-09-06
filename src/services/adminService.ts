import { getDataset } from "@/data";
import type { MockDataset } from "@/data/types";
import type {
  Bet,
  BetStatus,
  Competition,
  EventDetail,
  EventStatus,
  ListQuery,
  Paginated,
  Promotion,
  PromotionStatus,
  SportEvent,
  Transaction,
  TransactionKind,
  TransactionStatus,
  User,
} from "@/types";
import { toEventDetail } from "./sportsService";
import type {
  ActionResult,
  AdminEventInput,
  AdminEventQuery,
  AdminPromotionInput,
  AdminStats,
  AdminUserQuery,
  ResponsibleGamblingCase,
} from "./types";
import {
  asArray,
  containsNormalised,
  getDatasetIndex,
  paginate,
  sortItems,
  type SortAccessors,
  type SortDirection,
} from "./utils";

/**
 * Operator console reads.
 *
 * DEMO: the same generated dataset the player sees, viewed from the other
 * side. There is no operator account, no permission model and no audit trail
 * behind these calls — the console is a layout study, so every mutation
 * refuses rather than pretending to publish a market or settle a ticket.
 */

const MS_PER_DAY = 86_400_000;

/** Transaction states an operator still has to act on. */
const PENDING_TRANSACTION_STATUSES: ReadonlySet<TransactionStatus> = new Set([
  "pending",
  "processing",
]);

/** Highest first on the responsible-gambling queue. */
const SEVERITY_RANK: Record<ResponsibleGamblingCase["severity"], number> = {
  low: 0,
  medium: 1,
  high: 2,
};

/* ---------------------------------------------------------------------- stats */

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export async function getAdminStats(): Promise<AdminStats> {
  const dataset = getDataset();
  const activeSince = dataset.nowMs - MS_PER_DAY;

  let liveEvents = 0;
  let scheduledEvents = 0;
  for (const event of dataset.events) {
    if (event.status === "live") liveEvents += 1;
    else if (event.status === "scheduled") scheduledEvents += 1;
  }

  return {
    registeredUsers: dataset.adminUsers.length,
    activeUsers24h: dataset.adminUsers.filter(
      (user) => user.lastLoginAt !== null && Date.parse(user.lastLoginAt) >= activeSince,
    ).length,
    liveEvents,
    scheduledEvents,
    pendingTransactions: dataset.transactions.filter((transaction) =>
      PENDING_TRANSACTION_STATUSES.has(transaction.status),
    ).length,
    openBets: dataset.bets.filter((bet) => bet.status === "pending").length,
    totalStakeSimulated: round2(
      dataset.bets.reduce((total, bet) => total + bet.stake, 0),
    ),
    // Fixed: there is nothing to probe. A real console reads this from the
    // platform's health checks, not from a constant.
    systemStatus: "operational",
  };
}

/* --------------------------------------------------------------- list helpers */

interface SortFallback {
  sort: string;
  direction: SortDirection;
}

/**
 * Sort, then page. A `sort` the list does not expose falls back to its default
 * rather than silently returning an arbitrary order, which keeps a crafted
 * query from reaching fields the table never offered.
 */
function applyListQuery<T>(
  items: T[],
  query: ListQuery,
  accessors: SortAccessors<T>,
  fallback: SortFallback,
): Paginated<T> {
  const sort = query.sort && accessors[query.sort] ? query.sort : fallback.sort;
  const direction =
    query.direction ?? (sort === fallback.sort ? fallback.direction : "asc");

  return paginate(sortItems(items, accessors, sort, direction), query.page, query.pageSize);
}

/** Missing timestamps sort as "never", which belongs at the bottom of a descending list. */
function timeOf(value: string | null): number {
  return value === null ? 0 : Date.parse(value);
}

/* --------------------------------------------------------------------- tables */

const USER_SORTS: SortAccessors<User> = {
  createdAt: (user) => Date.parse(user.createdAt),
  lastLoginAt: (user) => timeOf(user.lastLoginAt),
  name: (user) => `${user.lastName} ${user.firstName}`,
  email: (user) => user.email,
  status: (user) => user.status,
  kycStatus: (user) => user.kycStatus,
};

export async function getAdminUsers(
  query: ListQuery & AdminUserQuery,
): Promise<Paginated<User>> {
  const statuses = asArray(query.status);
  const kycStatuses = asArray(query.kycStatus);
  const search = query.search?.trim();

  const matched = getDataset().adminUsers.filter((user) => {
    if (statuses.length > 0 && !statuses.includes(user.status)) return false;
    if (kycStatuses.length > 0 && !kycStatuses.includes(user.kycStatus)) return false;
    if (!search) return true;

    return [`${user.firstName} ${user.lastName}`, user.email, user.phone].some((field) =>
      containsNormalised(field, search),
    );
  });

  return applyListQuery(matched, query, USER_SORTS, {
    sort: "createdAt",
    direction: "desc",
  });
}

const EVENT_SORTS: SortAccessors<SportEvent> = {
  startTime: (event) => Date.parse(event.startTime),
  status: (event) => event.status,
  marketCount: (event) => event.marketCount,
};

export async function getAdminEvents(
  query: ListQuery & AdminEventQuery,
): Promise<Paginated<EventDetail>> {
  const dataset = getDataset();
  const index = getDatasetIndex(dataset);
  const statuses = asArray(query.status);
  const search = query.search?.trim();

  const matched = dataset.events.filter((event) => {
    if (query.sportId && event.sportId !== query.sportId) return false;
    if (statuses.length > 0 && !statuses.includes(event.status)) return false;
    if (!search) return true;

    const fields = [
      index.teamsById.get(event.homeTeamId)?.name,
      index.teamsById.get(event.awayTeamId)?.name,
      index.competitionsById.get(event.competitionId)?.name,
    ];
    return fields.some((field) => field !== undefined && containsNormalised(field, search));
  });

  const page = applyListQuery(matched, query, EVENT_SORTS, {
    sort: "startTime",
    direction: "asc",
  });

  // Only the visible rows are joined — an events table can hold a few thousand
  // fixtures and each join touches five tables.
  return { ...page, items: page.items.map((event) => toEventDetail(dataset, event)) };
}

const BET_SORTS: SortAccessors<Bet> = {
  placedAt: (bet) => Date.parse(bet.placedAt),
  settledAt: (bet) => timeOf(bet.settledAt),
  stake: (bet) => bet.stake,
  potentialReturn: (bet) => bet.potentialReturn,
  status: (bet) => bet.status,
};

export async function getAdminBets(
  query: ListQuery & { status?: BetStatus | BetStatus[] },
): Promise<Paginated<Bet>> {
  const statuses = asArray(query.status);
  const search = query.search?.trim();

  const matched = getDataset().bets.filter((bet) => {
    if (statuses.length > 0 && !statuses.includes(bet.status)) return false;
    return !search || containsNormalised(bet.reference, search);
  });

  return applyListQuery(matched, query, BET_SORTS, { sort: "placedAt", direction: "desc" });
}

const TRANSACTION_SORTS: SortAccessors<Transaction> = {
  createdAt: (transaction) => Date.parse(transaction.createdAt),
  completedAt: (transaction) => timeOf(transaction.completedAt),
  amount: (transaction) => transaction.amount,
  kind: (transaction) => transaction.kind,
  status: (transaction) => transaction.status,
};

export async function getAdminTransactions(
  query: ListQuery & {
    kind?: TransactionKind | TransactionKind[];
    status?: TransactionStatus | TransactionStatus[];
  },
): Promise<Paginated<Transaction>> {
  const kinds = asArray(query.kind);
  const statuses = asArray(query.status);
  const search = query.search?.trim();

  const matched = getDataset().transactions.filter((transaction) => {
    if (kinds.length > 0 && !kinds.includes(transaction.kind)) return false;
    if (statuses.length > 0 && !statuses.includes(transaction.status)) return false;
    return !search || containsNormalised(transaction.reference, search);
  });

  return applyListQuery(matched, query, TRANSACTION_SORTS, {
    sort: "createdAt",
    direction: "desc",
  });
}

const PROMOTION_SORTS: SortAccessors<Promotion> = {
  startsAt: (promotion) => Date.parse(promotion.startsAt),
  endsAt: (promotion) => timeOf(promotion.endsAt),
  slug: (promotion) => promotion.slug,
  status: (promotion) => promotion.status,
  kind: (promotion) => promotion.kind,
};

export async function getAdminPromotions(query: ListQuery): Promise<Paginated<Promotion>> {
  const search = query.search?.trim();

  // The slug and the title key are what an operator actually has to hand: the
  // rendered title is a translation resolved in the browser.
  const matched = getDataset().promotions.filter(
    (promotion) =>
      !search ||
      containsNormalised(promotion.slug, search) ||
      containsNormalised(promotion.titleKey, search),
  );

  return applyListQuery(matched, query, PROMOTION_SORTS, {
    sort: "startsAt",
    direction: "desc",
  });
}

const COMPETITION_SORTS: SortAccessors<Competition> = {
  name: (competition) => competition.name,
  eventCount: (competition) => competition.eventCount,
  liveEventCount: (competition) => competition.liveEventCount,
  popular: (competition) => (competition.popular ? 1 : 0),
};

export async function getAdminCompetitions(
  query: ListQuery,
): Promise<Paginated<Competition>> {
  const search = query.search?.trim();

  const matched = getDataset().competitions.filter(
    (competition) =>
      !search ||
      containsNormalised(competition.name, search) ||
      containsNormalised(competition.shortName, search),
  );

  return applyListQuery(matched, query, COMPETITION_SORTS, {
    sort: "name",
    direction: "asc",
  });
}

/* ------------------------------------------------- responsible gambling queue */

const CASE_SORTS: SortAccessors<ResponsibleGamblingCase> = {
  createdAt: (entry) => Date.parse(entry.createdAt),
  severity: (entry) => SEVERITY_RANK[entry.severity],
  userName: (entry) => entry.userName,
};

/**
 * An id with no matching record still has to be actionable, so the raw id is
 * shown rather than an empty cell.
 */
function userNameLookup(dataset: MockDataset): (userId: string) => string {
  const byId = new Map<string, User>();
  for (const user of [dataset.demoUser, ...dataset.adminUsers]) byId.set(user.id, user);

  return (userId) => {
    const user = byId.get(userId);
    return user ? `${user.firstName} ${user.lastName}` : userId;
  };
}

/**
 * The operator's welfare queue, derived rather than stored: active exclusions,
 * limit increases still inside their cooling-off window, and limits a player
 * has already spent through. A licensed operator would also feed this from
 * behavioural monitoring, which this build has none of.
 */
export async function getResponsibleGamblingCases(
  query: ListQuery,
): Promise<Paginated<ResponsibleGamblingCase>> {
  const dataset = getDataset();
  const nameOf = userNameLookup(dataset);
  const cases: ResponsibleGamblingCase[] = [];

  for (const exclusion of dataset.exclusions) {
    const indefinite = exclusion.endsAt === null;
    const coolingOff = exclusion.kind === "cooling_off";

    cases.push({
      id: `case-${exclusion.id}`,
      userId: exclusion.userId,
      userName: nameOf(exclusion.userId),
      kind: coolingOff
        ? "admin.rgCase.kind.coolingOff"
        : "admin.rgCase.kind.selfExclusion",
      detail: indefinite
        ? "admin.rgCase.detail.indefinite"
        : coolingOff
          ? "admin.rgCase.detail.coolingOffActive"
          : "admin.rgCase.detail.selfExclusionActive",
      createdAt: exclusion.startedAt,
      severity: coolingOff ? "medium" : "high",
    });
  }

  for (const limit of dataset.limits) {
    if (limit.pendingValue !== null) {
      cases.push({
        id: `case-${limit.id}-pending`,
        userId: limit.userId,
        userName: nameOf(limit.userId),
        kind: "admin.rgCase.kind.limitIncrease",
        detail: "admin.rgCase.detail.limitIncreasePending",
        createdAt: limit.pendingEffectiveFrom ?? limit.effectiveFrom,
        severity: "low",
      });
    }

    // Hitting a self-imposed ceiling is the signal a welfare team wants early,
    // well before an exclusion request arrives.
    if (limit.active && limit.used >= limit.value) {
      cases.push({
        id: `case-${limit.id}-reached`,
        userId: limit.userId,
        userName: nameOf(limit.userId),
        kind: "admin.rgCase.kind.limitReached",
        detail: "admin.rgCase.detail.limitReached",
        createdAt: limit.effectiveFrom,
        severity: "medium",
      });
    }
  }

  const search = query.search?.trim();
  const matched = search
    ? cases.filter((entry) => containsNormalised(entry.userName, search))
    : cases;

  return applyListQuery(matched, query, CASE_SORTS, {
    sort: "severity",
    direction: "desc",
  });
}

/* ------------------------------------------------------------ operator writes */

/**
 * Operator writes are intentionally unimplemented.
 *
 * Two reasons, in order of weight. A console that appears to publish markets,
 * settle tickets or launch promotions invites someone to treat this build as a
 * system of record, and none of the controls that would make that safe —
 * authentication, authorisation, four-eyes approval, an audit log — exists.
 * Second, the dataset is regenerated per time bucket, so a write would vanish
 * without explanation. The signatures are here so the console can be built
 * against the real shape and wired to a backing store later.
 */
function readOnly(): ActionResult {
  return { ok: false, errorKey: "admin.error.readOnlyDemo" };
}

export async function createEvent(input: AdminEventInput): Promise<ActionResult> {
  return readOnly();
}

export async function updateEvent(
  id: string,
  input: Partial<AdminEventInput>,
): Promise<ActionResult> {
  return readOnly();
}

export async function setEventStatus(
  id: string,
  status: EventStatus,
): Promise<ActionResult> {
  return readOnly();
}

export async function createPromotion(input: AdminPromotionInput): Promise<ActionResult> {
  return readOnly();
}

export async function updatePromotion(
  id: string,
  input: Partial<AdminPromotionInput>,
): Promise<ActionResult> {
  return readOnly();
}

export async function setPromotionStatus(
  id: string,
  status: PromotionStatus,
): Promise<ActionResult> {
  return readOnly();
}
