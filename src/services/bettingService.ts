import "server-only";

import type { Prisma } from "@prisma/client";

import { BETTING_RULES } from "@/config/app.config";
import { getDataset } from "@/data";
import { calculateSlip } from "@/lib/betting";
import { fromBig, fromBigOrNull, toBig, toMillimes } from "@/lib/money";
import { settleTicket, type LegResult } from "@/lib/settlement";
import type { BetPlacementInput } from "@/lib/validation";
import { isUniqueViolation, prisma, transact } from "@/server/db";
import { isDemo } from "@/server/env";
import { AuthError, requirePermission, requireUser } from "@/server/auth/guard";
import { notifyUser } from "@/server/notifications/notify";
import { audit } from "@/server/security/audit";
import { clampPage, cleanSearch, containsCI } from "@/server/repositories/filters";
import { describeEntry } from "@/server/wallet/descriptions";
import { appendLedgerEntry, LedgerError, newReference } from "@/server/wallet/ledger";
import { assertWagerAllowed } from "./responsibleService";
import { getDatasetIndex } from "./utils";
import type {
  Bet,
  BetSelectionRecord,
  BetSlipItem,
  BetStatus,
  Paginated,
  Selection,
} from "@/types";
import type { BetQuery } from "./types";

/**
 * Sportsbook tickets: placement, history and settlement.
 *
 * The browser sends *which* selections and *at what price it saw them*. Everything
 * else — whether the market is open, what the price is now, the combined odds, the
 * potential return, the total stake, whether the player is allowed to bet — is
 * decided here, from the server's own book and the player's own record.
 *
 * Placement is one database transaction: ticket rows, legs and the stake debit
 * commit together or not at all.
 */

const ODDS_TOLERANCE = 0.005;

export interface PlacedTicket {
  id: string;
  reference: string;
  mode: "single" | "multiple" | "system";
  stake: number;
  totalOdds: number;
  potentialReturn: number;
  selections: number;
}

export type PlaceBetResult =
  | { ok: true; tickets: PlacedTicket[]; balance: number; replayed: boolean }
  | {
      ok: false;
      errorKey: string;
      /** Selections whose price moved, so the slip can show the new figures. */
      changed?: Array<{ selectionId: string; odds: number }>;
    };

interface VerifiedLeg {
  eventId: string;
  marketId: string;
  selectionId: string;
  eventLabel: string;
  competitionLabel: string;
  marketNameKey: string;
  marketLine: number | null;
  selectionLabel: string;
  selectionLabelKey: string | null;
  odds: number;
  oddsMilli: number;
  startTime: Date;
  stake?: number;
}

function fail(errorKey: string, changed?: Array<{ selectionId: string; odds: number }>): PlaceBetResult {
  return { ok: false, errorKey, changed };
}

/** Looks every selection up in the server's book. Nothing about it is taken from the client. */
function verifyLegs(
  input: BetPlacementInput,
): { legs: VerifiedLeg[]; changed: Array<{ selectionId: string; odds: number }> } | string {
  const dataset = getDataset();
  const index = getDatasetIndex(dataset);
  const legs: VerifiedLeg[] = [];
  const changed: Array<{ selectionId: string; odds: number }> = [];
  const seen = new Set<string>();

  for (const requested of input.selections) {
    if (seen.has(requested.selectionId)) return "betting.error.duplicateSelection";
    seen.add(requested.selectionId);

    const selection: Selection | undefined = index.selectionsById.get(requested.selectionId);
    const market = selection ? index.marketsById.get(selection.marketId) : undefined;
    const event = selection ? index.eventsById.get(selection.eventId) : undefined;

    // The IDs the client sent must agree with the book — a mismatched triple is
    // either a stale slip or a crafted request, and neither gets a price.
    if (
      !selection ||
      !market ||
      !event ||
      market.id !== requested.marketId ||
      event.id !== requested.eventId
    ) {
      return "betting.error.selectionUnknown";
    }

    if (
      !selection.active ||
      market.status !== "open" ||
      (event.status !== "scheduled" && event.status !== "live")
    ) {
      return "betting.error.selectionUnavailable";
    }

    const home = index.teamsById.get(event.homeTeamId);
    const away = index.teamsById.get(event.awayTeamId);
    const competition = index.competitionsById.get(event.competitionId);
    if (!home || !away || !competition) return "betting.error.selectionUnknown";

    if (Math.abs(selection.odds - requested.odds) > ODDS_TOLERANCE) {
      changed.push({ selectionId: selection.id, odds: selection.odds });
    }

    legs.push({
      eventId: event.id,
      marketId: market.id,
      selectionId: selection.id,
      eventLabel: `${home.shortName} — ${away.shortName}`,
      competitionLabel: competition.name,
      marketNameKey: market.nameKey,
      marketLine: market.line ?? null,
      selectionLabel: selection.label ?? selection.labelKey ?? "",
      selectionLabelKey: selection.label ? null : (selection.labelKey ?? null),
      odds: selection.odds,
      oddsMilli: Math.round(selection.odds * 1000),
      startTime: new Date(event.startTime),
      stake: requested.stake,
    });
  }

  return { legs, changed };
}

export async function placeBet(
  input: BetPlacementInput & { idempotencyKey?: string },
): Promise<PlaceBetResult> {
  const user = await requireUser();

  const verified = verifyLegs(input);
  if (typeof verified === "string") return fail(verified);
  const { legs, changed } = verified;

  // A price that moved is only booked if the player said they would accept that.
  if (changed.length > 0 && !input.acceptOddsChange) {
    return fail("betting.error.oddsChanged", changed);
  }

  // Re-run the same arithmetic the slip uses, over the *server's* prices.
  const items: BetSlipItem[] = legs.map((leg) => ({
    id: leg.selectionId,
    selectionId: leg.selectionId,
    marketId: leg.marketId,
    eventId: leg.eventId,
    eventLabel: leg.eventLabel,
    competitionLabel: leg.competitionLabel,
    marketNameKey: leg.marketNameKey,
    marketKey: "1x2",
    outcome: "other",
    odds: leg.odds,
    stake: leg.stake ?? 0,
    suspended: false,
    addedAt: new Date().toISOString(),
    startTime: leg.startTime.toISOString(),
  }));

  const calc = calculateSlip({
    items,
    mode: input.mode,
    sharedStake: input.stake ?? 0,
    systemSize: input.systemSize ?? 2,
  });
  if (calc.errorKeys.length > 0) return fail(calc.errorKeys[0]!);
  if (calc.totalStake <= 0) return fail("betting.validation.stakeRequired");

  const stakeMillimes = toMillimes(calc.totalStake);

  // ---- tickets to create ---------------------------------------------------
  interface Draft {
    legs: VerifiedLeg[];
    stakeMillimes: number;
    mode: "single" | "multiple" | "system";
    systemSize?: number;
    totalOddsMilli: number;
    potentialReturnMillimes: number;
  }
  const drafts: Draft[] = [];

  if (input.mode === "single") {
    for (const leg of legs) {
      const stake = toMillimes(leg.stake ?? 0);
      drafts.push({
        legs: [leg],
        stakeMillimes: stake,
        mode: "single",
        totalOddsMilli: leg.oddsMilli,
        potentialReturnMillimes: cap(Math.round((stake * leg.oddsMilli) / 1000)),
      });
    }
  } else if (input.mode === "multiple") {
    const odds = Math.min(
      legs.reduce((product, leg) => product * leg.odds, 1),
      BETTING_RULES.maxCombinedOdds,
    );
    drafts.push({
      legs,
      stakeMillimes,
      mode: "multiple",
      totalOddsMilli: Math.round(odds * 1000),
      potentialReturnMillimes: cap(toMillimes(calc.potentialReturn)),
    });
  } else {
    const size = Math.min(Math.max(input.systemSize ?? 2, 2), Math.max(legs.length - 1, 2));
    drafts.push({
      legs,
      stakeMillimes,
      mode: "system",
      systemSize: size,
      totalOddsMilli: 0,
      potentialReturnMillimes: cap(toMillimes(calc.potentialReturn)),
    });
  }

  // ---- rules that depend on who is betting ----------------------------------
  try {
    await assertWagerAllowed(user, stakeMillimes);
    for (const draft of drafts) await assertWagerAllowed(user, draft.stakeMillimes);
  } catch (error) {
    if (error instanceof AuthError) return fail(error.messageKey);
    throw error;
  }

  const key = input.idempotencyKey;

  const replay = key ? await existingTickets(user.id, key) : null;
  if (replay) return replay;

  try {
    const result = await transact(async (tx) => {
      const placed: PlacedTicket[] = [];
      let balance = 0;

      for (const [position, draft] of drafts.entries()) {
        const reference = newReference("SG", 8);
        const bet = await tx.bet.create({
          data: {
            reference,
            userId: user.id,
            kind: "SPORTS",
            mode: draft.mode,
            systemSize: draft.systemSize ?? null,
            stake: toBig(draft.stakeMillimes),
            totalOddsMilli: draft.totalOddsMilli || null,
            potentialReturn: toBig(draft.potentialReturnMillimes),
            legs: {
              create: draft.legs.map((leg, order) => ({
                position: order,
                eventId: leg.eventId,
                marketId: leg.marketId,
                selectionId: leg.selectionId,
                eventLabel: leg.eventLabel,
                competitionLabel: leg.competitionLabel,
                marketNameKey: leg.marketNameKey,
                marketLine: leg.marketLine,
                selectionLabel: leg.selectionLabel,
                selectionLabelKey: leg.selectionLabelKey,
                oddsMilli: leg.oddsMilli,
                startTime: leg.startTime,
              })),
            },
          },
        });

        const description = describeEntry("BET", { betReference: reference });
        const { entry } = await appendLedgerEntry(tx, {
          userId: user.id,
          type: "BET",
          amount: -draft.stakeMillimes,
          description: description.description,
          idempotencyKey: key ? `${key}:${position}` : null,
          createdById: user.id,
          betId: bet.id,
          metadata: { descriptionKey: description.descriptionKey, params: description.params },
        });

        balance = entry.balanceAfter;
        placed.push({
          id: bet.id,
          reference,
          mode: draft.mode,
          stake: draft.stakeMillimes / 1000,
          totalOdds: draft.totalOddsMilli / 1000,
          potentialReturn: draft.potentialReturnMillimes / 1000,
          selections: draft.legs.length,
        });
      }

      return { placed, balance };
    });

    return { ok: true, tickets: result.placed, balance: result.balance / 1000, replayed: false };
  } catch (error) {
    if (error instanceof LedgerError) return fail(error.messageKey);
    if (key && isUniqueViolation(error, "idempotencyKey")) {
      return (await existingTickets(user.id, key)) ?? fail("common.error.unexpected");
    }
    throw error;
  }
}

function cap(millimes: number): number {
  return Math.min(millimes, toMillimes(BETTING_RULES.maxPotentialReturn));
}

/** A retried request returns the tickets the first attempt created. */
async function existingTickets(userId: string, key: string): Promise<PlaceBetResult | null> {
  const rows = await prisma.transaction.findMany({
    where: { userId, idempotencyKey: { startsWith: `${key}:` } },
    include: { bet: { include: { legs: true } } },
    orderBy: { createdAt: "asc" },
  });
  if (rows.length === 0) return null;

  const wallet = await prisma.wallet.findUnique({ where: { userId } });
  return {
    ok: true,
    replayed: true,
    balance: fromBig(wallet?.balance) / 1000,
    tickets: rows.flatMap((row) =>
      row.bet
        ? [
            {
              id: row.bet.id,
              reference: row.bet.reference,
              mode: (row.bet.mode ?? "single") as PlacedTicket["mode"],
              stake: fromBig(row.bet.stake) / 1000,
              totalOdds: (row.bet.totalOddsMilli ?? 0) / 1000,
              potentialReturn: fromBig(row.bet.potentialReturn) / 1000,
              selections: row.bet.legs.length,
            },
          ]
        : [],
    ),
  };
}

/* ========================================================================== */
/* reads                                                                      */
/* ========================================================================== */

const betInclude = { legs: { orderBy: { position: "asc" } } } satisfies Prisma.BetInclude;
type BetRow = Prisma.BetGetPayload<{ include: typeof betInclude }>;

const BET_STATUS: Record<BetRow["status"], BetStatus> = {
  OPEN: "pending",
  WON: "won",
  LOST: "lost",
  VOID: "void",
  CASHED_OUT: "cashed_out",
};

const LEG_STATUS: Record<BetRow["legs"][number]["status"], BetStatus> = {
  OPEN: "pending",
  WON: "won",
  LOST: "lost",
  VOID: "void",
};

export function toBet(row: BetRow): Bet {
  const selections: BetSelectionRecord[] = row.legs.map((leg) => ({
    id: leg.id,
    eventId: leg.eventId,
    eventLabel: leg.eventLabel,
    competitionLabel: leg.competitionLabel,
    marketNameKey: leg.marketNameKey,
    marketLine: leg.marketLine ?? undefined,
    selectionLabel: leg.selectionLabel,
    selectionLabelKey: leg.selectionLabelKey ?? undefined,
    odds: leg.oddsMilli / 1000,
    status: LEG_STATUS[leg.status],
    startTime: leg.startTime.toISOString(),
  }));

  return {
    id: row.id,
    reference: row.reference,
    userId: row.userId,
    kind: row.kind === "SPORTS" ? "sports" : "casino",
    gameKey: row.gameKey ?? undefined,
    systemSize: row.systemSize ?? undefined,
    mode: (row.mode ?? "single") as Bet["mode"],
    selections,
    stake: fromBig(row.stake) / 1000,
    totalOdds: (row.totalOddsMilli ?? 0) / 1000,
    potentialReturn: (fromBigOrNull(row.potentialReturn) ?? fromBig(row.payout)) / 1000,
    payout: row.payout === null ? null : fromBig(row.payout) / 1000,
    status: BET_STATUS[row.status],
    placedAt: row.placedAt.toISOString(),
    settledAt: row.settledAt?.toISOString() ?? null,
    simulated: isDemo,
  };
}

const DB_STATUS: Record<BetStatus, BetRow["status"] | null> = {
  pending: "OPEN",
  won: "WON",
  lost: "LOST",
  void: "VOID",
  cashed_out: "CASHED_OUT",
  cancelled: null,
};

function whereFor(query: BetQuery & { userId?: string; kind?: "sports" | "casino" }): Prisma.BetWhereInput {
  const statuses = (Array.isArray(query.status) ? query.status : query.status ? [query.status] : [])
    .map((status) => DB_STATUS[status])
    .filter((status): status is BetRow["status"] => status !== null);
  const search = cleanSearch(query.search);

  return {
    ...(query.userId ? { userId: query.userId } : {}),
    ...(query.kind ? { kind: query.kind === "sports" ? "SPORTS" : "CASINO" } : {}),
    ...(statuses.length ? { status: { in: statuses } } : {}),
    ...(query.fromIso || query.toIso
      ? {
          placedAt: {
            ...(query.fromIso ? { gte: new Date(query.fromIso) } : {}),
            ...(query.toIso ? { lte: new Date(query.toIso) } : {}),
          },
        }
      : {}),
    ...(search
      ? {
          OR: [
            { reference: containsCI(search) },
            { gameKey: containsCI(search) },
            { legs: { some: { eventLabel: containsCI(search) } } },
            { legs: { some: { competitionLabel: containsCI(search) } } },
          ],
        }
      : {}),
  };
}

/** The signed-in player's own tickets and casino rounds. */
export async function getBets(query: BetQuery = {}): Promise<Paginated<Bet>> {
  const user = await requireUser();
  const where = whereFor({ ...query, userId: user.id });
  const { page, pageSize, skip, take } = clampPage(query.page, query.pageSize);

  const [rows, total] = await Promise.all([
    prisma.bet.findMany({
      where,
      include: betInclude,
      orderBy: [{ placedAt: "desc" }, { id: "desc" }],
      skip,
      take,
    }),
    prisma.bet.count({ where }),
  ]);

  return {
    items: rows.map(toBet),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getBetById(id: string): Promise<Bet | null> {
  const user = await requireUser();
  // Scoped to the session user in the query itself: another player's id is
  // indistinguishable from one that does not exist.
  const row = await prisma.bet.findFirst({ where: { id, userId: user.id }, include: betInclude });
  return row ? toBet(row) : null;
}

/* ========================================================================== */
/* admin                                                                      */
/* ========================================================================== */

export interface AdminBetQuery extends BetQuery {
  userId?: string;
  kind?: "sports" | "casino";
}

export interface AdminBet extends Bet {
  username: string;
  legIds: string[];
}

export async function getAdminBets(query: AdminBetQuery = {}): Promise<Paginated<AdminBet>> {
  await requirePermission("bets.read");
  const where = whereFor(query);
  const { page, pageSize, skip, take } = clampPage(query.page, query.pageSize);

  const [rows, total] = await Promise.all([
    prisma.bet.findMany({
      where,
      include: { ...betInclude, user: { select: { username: true } } },
      orderBy: [{ placedAt: "desc" }, { id: "desc" }],
      skip,
      take,
    }),
    prisma.bet.count({ where }),
  ]);

  return {
    items: rows.map((row) => ({
      ...toBet(row),
      username: row.user.username,
      legIds: row.legs.map((leg) => leg.id),
    })),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getAdminBet(id: string): Promise<AdminBet | null> {
  await requirePermission("bets.read");
  const row = await prisma.bet.findUnique({
    where: { id },
    include: { ...betInclude, user: { select: { username: true } } },
  });
  if (!row) return null;
  return { ...toBet(row), username: row.user.username, legIds: row.legs.map((leg) => leg.id) };
}

export interface SettleBetResult {
  ok: boolean;
  errorKey?: string;
  payout?: number;
  status?: "won" | "lost" | "void";
}

/**
 * Settles a sportsbook ticket from the result of each leg.
 *
 * The event feed is generated, not live, so an operator decides each leg; the
 * server then computes the payout with the same pure function the admin screen
 * previews. The ticket moves OPEN → settled with a conditional update, so two
 * administrators (or one double-click) cannot pay it twice, and the credit
 * carries an idempotency key of its own as a second lock.
 */
export async function settleBet(
  betId: string,
  results: Record<string, LegResult>,
): Promise<SettleBetResult> {
  const actor = await requirePermission("bets.settle");

  const bet = await prisma.bet.findUnique({ where: { id: betId }, include: betInclude });
  if (!bet || bet.kind !== "SPORTS") return { ok: false, errorKey: "admin.bets.error.notFound" };
  if (bet.status !== "OPEN") return { ok: false, errorKey: "admin.bets.error.alreadySettled" };

  const legs = bet.legs.map((leg) => ({ id: leg.id, oddsMilli: leg.oddsMilli, result: results[leg.id] }));
  if (legs.some((leg) => !leg.result)) {
    return { ok: false, errorKey: "admin.bets.error.allLegsRequired" };
  }

  const settlement = settleTicket(
    (bet.mode ?? "single") as "single" | "multiple" | "system",
    fromBig(bet.stake),
    legs.map((leg) => ({ oddsMilli: leg.oddsMilli, result: leg.result! })),
    bet.systemSize ?? undefined,
  );

  const outcome = await transact(async (tx) => {
    const claimed = await tx.bet.updateMany({
      where: { id: bet.id, status: "OPEN" },
      data: {
        status: settlement.status,
        payout: toBig(settlement.payoutMillimes),
        settledAt: new Date(),
        settledById: actor.id,
      },
    });
    if (claimed.count !== 1) return null;

    for (const leg of legs) {
      await tx.betLeg.update({ where: { id: leg.id }, data: { status: leg.result! } });
    }

    let transactionId: string | undefined;
    if (settlement.payoutMillimes > 0) {
      const type = settlement.status === "VOID" ? "REFUND" : "WIN";
      const description = describeEntry(type, { betReference: bet.reference });
      const { entry } = await appendLedgerEntry(tx, {
        userId: bet.userId,
        type,
        amount: settlement.payoutMillimes,
        description: description.description,
        idempotencyKey: `settle:${bet.id}`,
        createdById: actor.id,
        betId: bet.id,
        metadata: { descriptionKey: description.descriptionKey, params: description.params },
      });
      transactionId = entry.id;
    }

    await audit({
      tx,
      action: "admin.bet.settled",
      actor,
      targetUserId: bet.userId,
      targetType: "bet",
      targetId: bet.id,
      transactionId,
      description: `Settled ${bet.reference} as ${settlement.status}, payout ${(settlement.payoutMillimes / 1000).toFixed(3)}`,
      metadata: {
        legs: legs.map((leg) => ({ id: leg.id, result: leg.result })),
        payoutMillimes: settlement.payoutMillimes,
        stakeMillimes: fromBig(bet.stake),
      },
    });

    await notifyUser(bet.userId, {
      tx,
      kind: "bet_settled",
      titleKey: "notify.betSettled.title",
      bodyKey: `notify.betSettled.${settlement.status.toLowerCase()}`,
      params: { reference: bet.reference, amount: (settlement.payoutMillimes / 1000).toFixed(2) },
      href: "/account/bets",
    });
    return true;
  });

  if (!outcome) return { ok: false, errorKey: "admin.bets.error.alreadySettled" };

  return {
    ok: true,
    payout: settlement.payoutMillimes / 1000,
    status: settlement.status.toLowerCase() as "won" | "lost" | "void",
  };
}

