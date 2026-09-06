import type {
  AppNotification,
  Bet,
  BetSelectionRecord,
  BetStatus,
  Favorite,
  ResponsibleGamblingLimit,
  SelfExclusion,
  Transaction,
  TransactionKind,
  TransactionStatus,
  User,
  Wallet,
} from "@/types";
import { JURISDICTION, RESPONSIBLE_GAMBLING } from "@/config/app.config";
import { COMPETITIONS, TEAMS, TEAM_BY_ID } from "./catalog";
import { chance, hashString, pick, range, round2, seeded, token, type Rng } from "./rng";

/**
 * Demo account data: one player, their wallet, betting history, ledger,
 * notifications, favourites and responsible-gambling limits — plus a synthetic
 * user population for the admin tables.
 *
 * ── SIMULATED ─────────────────────────────────────────────────────────────
 * The balance is a number in a sandbox ledger. It is not money, it was never
 * deposited, and it cannot be withdrawn. Every record carries
 * `simulated: true` so no surface can render it without knowing.
 * ──────────────────────────────────────────────────────────────────────────
 */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export const DEMO_USER_ID = "user-demo-001";

/* ------------------------------------------------------------------- player */

export function buildDemoUser(nowMs: number): User {
  // ~29 years old, fixed relative to "now" so the age gate always passes.
  const dob = new Date(nowMs - 29 * 365.25 * DAY);
  dob.setUTCHours(0, 0, 0, 0);

  return {
    id: DEMO_USER_ID,
    email: "amine.bensalah@demo.sportgo.example",
    firstName: "Amine",
    lastName: "Ben Salah",
    phone: "+21620123456",
    dateOfBirth: dob.toISOString().slice(0, 10),
    countryCode: JURISDICTION.code,
    role: "player",
    status: "active",
    // Demo mode never verifies anyone. This must not read `verified` — the UI
    // is required to show the account as unverified and say why.
    kycStatus: "not_started",
    ageDeclaredAt: new Date(nowMs - 120 * DAY).toISOString(),
    locale: "fr",
    createdAt: new Date(nowMs - 120 * DAY).toISOString(),
    lastLoginAt: new Date(nowMs - 3 * HOUR).toISOString(),
    twoFactorEnabled: false,
    emailVerified: true,
    phoneVerified: false,
  };
}

/* --------------------------------------------------------------------- bets */

const BET_STATUS_WEIGHTS: Array<{ status: BetStatus; weight: number }> = [
  { status: "won", weight: 30 },
  { status: "lost", weight: 44 },
  { status: "pending", weight: 16 },
  { status: "cancelled", weight: 4 },
  { status: "void", weight: 3 },
  { status: "cashed_out", weight: 3 },
];

function pickStatus(rng: Rng, forcePending: boolean): BetStatus {
  if (forcePending) return "pending";
  const total = BET_STATUS_WEIGHTS.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = rng() * total;
  for (const entry of BET_STATUS_WEIGHTS) {
    roll -= entry.weight;
    if (roll <= 0) return entry.status;
  }
  return "lost";
}

const FOOTBALL_TEAMS = TEAMS.filter((team) => team.id.startsWith("team-fb-"));
const FOOTBALL_COMPETITIONS = COMPETITIONS.filter(
  (competition) => competition.sportId === "sport-football",
);

const SELECTION_TEMPLATES = [
  { marketNameKey: "markets.1x2", pick: "home" as const },
  { marketNameKey: "markets.1x2", pick: "away" as const },
  { marketNameKey: "markets.doubleChance", pick: "home" as const },
  { marketNameKey: "markets.overUnder", pick: "over" as const },
  { marketNameKey: "markets.btts", pick: "yes" as const },
];

function buildSelection(rng: Rng, placedMs: number, status: BetStatus): BetSelectionRecord {
  const home = pick(rng, FOOTBALL_TEAMS);
  let away = pick(rng, FOOTBALL_TEAMS);
  while (away.id === home.id) away = pick(rng, FOOTBALL_TEAMS);

  const competition = pick(rng, FOOTBALL_COMPETITIONS);
  const template = pick(rng, SELECTION_TEMPLATES);

  const label =
    template.pick === "home"
      ? home.shortName
      : template.pick === "away"
        ? away.shortName
        : template.pick === "over"
          ? "Over 2.5"
          : "Yes";

  return {
    id: `betsel-${token(rng, 8)}`,
    eventLabel: `${home.shortName} — ${away.shortName}`,
    competitionLabel: competition.name,
    marketNameKey: template.marketNameKey,
    selectionLabel: label,
    odds: round2(1.35 + rng() * 3.1),
    // A settled ticket's legs are settled; a pending one's are not.
    status: status === "pending" ? "pending" : status === "won" ? "won" : status,
    startTime: new Date(placedMs + range(rng, 2, 72) * HOUR).toISOString(),
  };
}

export function buildBets(nowMs: number): Bet[] {
  const rng = seeded(hashString("sportgo:bets") ^ Math.floor(nowMs / DAY));
  const bets: Bet[] = [];

  for (let index = 0; index < 24; index += 1) {
    // Newest first once sorted; the four most recent are still running.
    const daysAgo = index < 4 ? rng() * 2 : 2 + rng() * 58;
    const placedMs = nowMs - daysAgo * DAY;
    const status = pickStatus(rng, index < 4);

    const legCount = index % 5 === 0 ? range(rng, 3, 5) : chance(rng, 0.45) ? range(rng, 2, 3) : 1;
    const mode = legCount === 1 ? "single" : legCount >= 4 && chance(rng, 0.4) ? "system" : "multiple";

    const selections = Array.from({ length: legCount }, () =>
      buildSelection(rng, placedMs, status),
    );

    // A lost multiple must contain at least one losing leg, or the ticket
    // would contradict itself on screen.
    if (status === "lost" && selections.length > 1) {
      const loser = selections[range(rng, 0, selections.length - 1)];
      if (loser) loser.status = "lost";
      selections.forEach((selection) => {
        if (selection !== loser) selection.status = "won";
      });
    }

    const totalOdds = round2(
      selections.reduce((product, selection) => product * selection.odds, 1),
    );
    const stake = round2(pick(rng, [5, 10, 10, 15, 20, 25, 50]));
    const potentialReturn = round2(Math.min(stake * totalOdds, 50_000));

    const settledAt =
      status === "pending"
        ? null
        : new Date(placedMs + range(rng, 3, 96) * HOUR).toISOString();

    const payout =
      status === "won"
        ? potentialReturn
        : status === "cashed_out"
          ? round2(potentialReturn * (0.35 + rng() * 0.4))
          : status === "cancelled" || status === "void"
            ? stake
            : status === "lost"
              ? 0
              : null;

    bets.push({
      id: `bet-${token(rng, 10)}`,
      reference: `SG-${token(rng, 6).toUpperCase()}`,
      userId: DEMO_USER_ID,
      mode,
      selections,
      stake,
      totalOdds,
      potentialReturn,
      payout,
      status,
      placedAt: new Date(placedMs).toISOString(),
      settledAt,
      simulated: true,
    });
  }

  return bets.sort((a, b) => b.placedAt.localeCompare(a.placedAt));
}

/* ------------------------------------------------------------------ ledger */

interface LedgerEntry {
  kind: TransactionKind;
  status: TransactionStatus;
  amount: number;
  atMs: number;
  descriptionKey: string;
  params?: Record<string, string | number>;
  methodId?: string;
}

/**
 * The ledger is built forward from an opening balance so `balanceAfter`
 * actually reconciles — a transaction table whose running balance does not
 * add up is the first thing a reviewer notices.
 */
export function buildLedger(
  nowMs: number,
  bets: Bet[],
): { transactions: Transaction[]; closingBalance: number; reserved: number } {
  const rng = seeded(hashString("sportgo:ledger") ^ Math.floor(nowMs / DAY));
  const entries: LedgerEntry[] = [];

  // Opening deposits.
  for (let index = 0; index < 6; index += 1) {
    entries.push({
      kind: "deposit",
      status: "completed",
      amount: round2(pick(rng, [50, 100, 100, 150, 200])),
      atMs: nowMs - (58 - index * 8) * DAY,
      descriptionKey: "wallet.tx.deposit",
      methodId: "pm-bank-transfer",
    });
  }

  entries.push({
    kind: "bonus",
    status: "completed",
    amount: 25,
    atMs: nowMs - 57 * DAY,
    descriptionKey: "wallet.tx.welcomeBonus",
  });

  // Stakes and settlements, mirrored from the bet history so the two agree.
  for (const bet of bets) {
    const placedMs = new Date(bet.placedAt).getTime();
    entries.push({
      kind: "bet_stake",
      status: "completed",
      amount: -bet.stake,
      atMs: placedMs,
      descriptionKey: "wallet.tx.betStake",
      params: { reference: bet.reference },
    });

    if (bet.settledAt && bet.payout !== null && bet.payout > 0) {
      entries.push({
        kind: bet.status === "won" || bet.status === "cashed_out" ? "bet_payout" : "refund",
        status: "completed",
        amount: bet.payout,
        atMs: new Date(bet.settledAt).getTime(),
        descriptionKey:
          bet.status === "won"
            ? "wallet.tx.betPayout"
            : bet.status === "cashed_out"
              ? "wallet.tx.cashOut"
              : "wallet.tx.betRefund",
        params: { reference: bet.reference },
      });
    }
  }

  // A couple of withdrawals, one still processing and one that failed — both
  // states the wallet UI has to render.
  entries.push({
    kind: "withdrawal",
    status: "completed",
    amount: -120,
    atMs: nowMs - 26 * DAY,
    descriptionKey: "wallet.tx.withdrawal",
    methodId: "pm-bank-transfer",
  });
  entries.push({
    kind: "withdrawal",
    status: "failed",
    amount: 0,
    atMs: nowMs - 11 * DAY,
    descriptionKey: "wallet.tx.withdrawalFailed",
    methodId: "pm-mobile-money",
  });
  entries.push({
    kind: "withdrawal",
    status: "processing",
    amount: -60,
    atMs: nowMs - 2 * DAY,
    descriptionKey: "wallet.tx.withdrawal",
    methodId: "pm-bank-transfer",
  });
  entries.push({
    kind: "adjustment",
    status: "completed",
    amount: 4.5,
    atMs: nowMs - 5 * DAY,
    descriptionKey: "wallet.tx.adjustment",
  });

  entries.sort((a, b) => a.atMs - b.atMs);

  let balance = 0;
  const transactions: Transaction[] = entries.map((entry) => {
    // Only settled movements touch the balance; pending and failed ones do not.
    if (entry.status === "completed") balance = round2(balance + entry.amount);

    return {
      id: `tx-${token(rng, 10)}`,
      reference: `TX-${token(rng, 8).toUpperCase()}`,
      userId: DEMO_USER_ID,
      kind: entry.kind,
      status: entry.status,
      amount: entry.amount,
      currency: JURISDICTION.currency,
      balanceAfter: balance,
      methodId: entry.methodId,
      descriptionKey: entry.descriptionKey,
      params: entry.params,
      createdAt: new Date(entry.atMs).toISOString(),
      completedAt: entry.status === "completed" ? new Date(entry.atMs).toISOString() : null,
      simulated: true,
    };
  });

  const reserved = round2(
    bets
      .filter((bet) => bet.status === "pending")
      .reduce((sum, bet) => sum + bet.stake, 0),
  );

  return {
    transactions: transactions.reverse(), // newest first for display
    closingBalance: balance,
    reserved,
  };
}

export function buildWallet(nowMs: number, balance: number, reserved: number): Wallet {
  const bonusBalance = 25;
  return {
    userId: DEMO_USER_ID,
    currency: JURISDICTION.currency,
    balance,
    reserved,
    // Bonus funds carry wagering requirements, so they are not withdrawable.
    withdrawable: round2(Math.max(0, balance - reserved - bonusBalance)),
    bonusBalance,
    updatedAt: new Date(nowMs).toISOString(),
    simulated: true,
  };
}

/* ------------------------------------------------------- limits & exclusions */

export function buildLimits(nowMs: number): ResponsibleGamblingLimit[] {
  const iso = (offsetDays: number) => new Date(nowMs + offsetDays * DAY).toISOString();

  return [
    {
      id: "rgl-deposit-daily",
      userId: DEMO_USER_ID,
      kind: "deposit",
      period: "daily",
      value: 200,
      used: 40,
      active: true,
      effectiveFrom: iso(-45),
      pendingValue: null,
      pendingEffectiveFrom: null,
    },
    {
      id: "rgl-stake-weekly",
      userId: DEMO_USER_ID,
      kind: "stake",
      period: "weekly",
      value: 500,
      used: 120,
      active: true,
      effectiveFrom: iso(-30),
      // A pending *increase* — deliberately delayed by the cooling-off window.
      pendingValue: 750,
      pendingEffectiveFrom: new Date(
        nowMs + RESPONSIBLE_GAMBLING.limitIncreaseCoolingOffHours * HOUR,
      ).toISOString(),
    },
    {
      id: "rgl-session-daily",
      userId: DEMO_USER_ID,
      kind: "session_duration",
      period: "daily",
      value: 120,
      used: 35,
      active: true,
      effectiveFrom: iso(-14),
      pendingValue: null,
      pendingEffectiveFrom: null,
    },
    {
      id: "rgl-loss-monthly",
      userId: DEMO_USER_ID,
      kind: "loss",
      period: "monthly",
      value: 400,
      used: 165,
      active: true,
      effectiveFrom: iso(-60),
      pendingValue: null,
      pendingEffectiveFrom: null,
    },
  ];
}

/** No exclusion is active on the demo account, but the shape is exercised. */
export const DEMO_EXCLUSIONS: SelfExclusion[] = [];

/* -------------------------------------------------------------- engagement */

export function buildFavorites(nowMs: number): Favorite[] {
  const at = new Date(nowMs - 20 * DAY).toISOString();
  return [
    { id: "fav-1", userId: DEMO_USER_ID, kind: "sport", targetId: "sport-football", createdAt: at },
    { id: "fav-2", userId: DEMO_USER_ID, kind: "competition", targetId: "comp-tn-lp1", createdAt: at },
    { id: "fav-3", userId: DEMO_USER_ID, kind: "competition", targetId: "comp-uefa-ucl", createdAt: at },
    { id: "fav-4", userId: DEMO_USER_ID, kind: "team", targetId: "team-fb-est", createdAt: at },
    { id: "fav-5", userId: DEMO_USER_ID, kind: "team", targetId: "team-fb-ess", createdAt: at },
  ];
}

export function buildNotifications(nowMs: number, bets: Bet[]): AppNotification[] {
  const settled = bets.find((bet) => bet.status === "won");
  const at = (minutesAgo: number) => new Date(nowMs - minutesAgo * 60_000).toISOString();

  return [
    {
      id: "notif-1",
      userId: DEMO_USER_ID,
      kind: "match_starting",
      titleKey: "notifications.matchStarting.title",
      bodyKey: "notifications.matchStarting.body",
      params: { event: "Espérance — Club Africain", minutes: 30 },
      href: "/live",
      read: false,
      createdAt: at(12),
    },
    {
      id: "notif-2",
      userId: DEMO_USER_ID,
      kind: "bet_settled",
      titleKey: "notifications.betSettled.title",
      bodyKey: "notifications.betSettled.body",
      params: { reference: settled?.reference ?? "SG-000000" },
      href: "/account/bets",
      read: false,
      createdAt: at(180),
    },
    {
      id: "notif-3",
      userId: DEMO_USER_ID,
      kind: "promotion",
      titleKey: "notifications.promotion.title",
      bodyKey: "notifications.promotion.body",
      href: "/promotions",
      read: false,
      createdAt: at(600),
    },
    {
      id: "notif-4",
      userId: DEMO_USER_ID,
      kind: "responsible_gambling",
      titleKey: "notifications.responsibleGambling.title",
      bodyKey: "notifications.responsibleGambling.body",
      href: "/responsible-gambling",
      read: true,
      createdAt: at(1_500),
    },
    {
      id: "notif-5",
      userId: DEMO_USER_ID,
      kind: "account",
      titleKey: "notifications.account.title",
      bodyKey: "notifications.account.body",
      href: "/account/security",
      read: true,
      createdAt: at(2_900),
    },
    {
      id: "notif-6",
      userId: DEMO_USER_ID,
      kind: "match_starting",
      titleKey: "notifications.matchStarting.title",
      bodyKey: "notifications.matchStarting.body",
      params: { event: "CS Sfaxien — US Monastir", minutes: 60 },
      href: "/sports/football",
      read: true,
      createdAt: at(4_320),
    },
    {
      id: "notif-7",
      userId: DEMO_USER_ID,
      kind: "bet_settled",
      titleKey: "notifications.betSettled.title",
      bodyKey: "notifications.betSettled.body",
      params: { reference: bets[3]?.reference ?? "SG-000000" },
      href: "/account/bets",
      read: true,
      createdAt: at(5_800),
    },
    {
      id: "notif-8",
      userId: DEMO_USER_ID,
      kind: "promotion",
      titleKey: "notifications.promotion.title",
      bodyKey: "notifications.promotion.body",
      href: "/promotions",
      read: true,
      createdAt: at(8_600),
    },
  ];
}

/* --------------------------------------------------------- admin population */

const FIRST_NAMES = [
  "Amine", "Yassine", "Mariem", "Sarra", "Karim", "Nour", "Hamza", "Rania",
  "Youssef", "Ines", "Mehdi", "Salma", "Bilel", "Emna", "Anis", "Dorra",
  "Wassim", "Olfa", "Skander", "Chaima", "Lucas", "Marta", "Omar", "Leila",
];

const LAST_NAMES = [
  "Ben Salah", "Trabelsi", "Gharbi", "Jelassi", "Bouazizi", "Chaabane",
  "Mansouri", "Hammami", "Khelifi", "Ayari", "Zouari", "Sassi", "Ben Amor",
  "Dridi", "Ferchichi", "Nasri", "Rekik", "Ben Youssef", "Mejri", "Larbi",
];

const ADMIN_COUNTRIES = ["TN", "TN", "TN", "TN", "FR", "DZ", "MA", "IT", "DE"];

/**
 * A synthetic population for the operator tables. Every address is on
 * `demo.sportgo.example`, which is reserved and unroutable — no message can
 * ever reach a real person.
 */
export function buildAdminUsers(nowMs: number): User[] {
  const rng = seeded(hashString("sportgo:admin-users"));
  const users: User[] = [];

  for (let index = 0; index < 60; index += 1) {
    const firstName = pick(rng, FIRST_NAMES);
    const lastName = pick(rng, LAST_NAMES);
    const createdMs = nowMs - range(rng, 1, 540) * DAY;
    const dob = new Date(nowMs - range(rng, 19, 58) * 365.25 * DAY);

    const status = chance(rng, 0.86)
      ? "active"
      : chance(rng, 0.5)
        ? "restricted"
        : chance(rng, 0.6)
          ? "self_excluded"
          : "closed";

    users.push({
      id: `user-${String(index + 1).padStart(4, "0")}`,
      email: `${firstName}.${lastName}${index}`
        .toLowerCase()
        .replace(/\s+/g, "")
        .concat("@demo.sportgo.example"),
      firstName,
      lastName,
      phone: `+216${range(rng, 20_000_000, 59_999_999)}`,
      dateOfBirth: dob.toISOString().slice(0, 10),
      countryCode: pick(rng, ADMIN_COUNTRIES),
      role: "player",
      status,
      // Demo mode verifies nobody — the whole population reflects that.
      kycStatus: "not_started",
      ageDeclaredAt: new Date(createdMs).toISOString(),
      locale: pick(rng, ["fr", "fr", "ar", "en"]),
      createdAt: new Date(createdMs).toISOString(),
      lastLoginAt:
        chance(rng, 0.75) ? new Date(nowMs - range(rng, 1, 720) * HOUR).toISOString() : null,
      twoFactorEnabled: chance(rng, 0.22),
      emailVerified: chance(rng, 0.9),
      phoneVerified: chance(rng, 0.55),
    });
  }

  return users;
}

/** Kept for the favourites sidebar, which needs names without a service call. */
export const FAVORITE_TEAM_LOOKUP = TEAM_BY_ID;
