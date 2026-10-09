"use server";

import { revalidatePath } from "next/cache";

import type { ActionState } from "@/lib/actionState";
import {
  adjustmentSchema,
  createManagerSchema,
  createPlayerSchema,
  creditSchema,
  decisionSchema,
  playerActionSchema,
  resetCredentialsSchema,
  restrictionsSchema,
  settleBetSchema,
  verificationSchema,
} from "@/lib/adminValidation";
import { guarded, readBoolean, text, zodFieldErrors } from "@/server/actions";
import { updateSettings } from "@/server/settings/settingsService";
import { createManagerAccount, createPlayerAccount, resetCredentials } from "@/services/accountService";
import { issueCreditToManager, sellCreditToPlayer } from "@/services/creditService";
import {
  changeStatus,
  lockPlayer,
  reactivatePlayer,
  revokePlayerSessions,
  setPlayerRestrictions,
  setPlayerVerification,
  suspendPlayer,
} from "@/services/playerAdminService";
import { adjustWallet, decideAdjustment, processWithdrawal } from "@/services/walletAdminService";
import { settleBet } from "@/services/bettingService";
import { searchAdmin } from "@/services/searchService";

/**
 * Administrator actions.
 *
 * Nothing in this file decides who may do what. Each action parses its input,
 * calls a service, and the service starts with `requirePermission(...)` against
 * the role read from the database on this request. A player (or an anonymous
 * caller) who invokes one of these directly is refused there, and `guarded`
 * writes the attempt to the audit trail.
 */

function done(paths: string[], state: ActionState): ActionState {
  if (state.ok) for (const path of paths) revalidatePath(path);
  return state;
}

/* ---------------------------------------------------------------- players */

/** What a creation form hands back so the page can show the credentials once. */
function credentialsData(result: {
  accountId?: string;
  credentials?: { username: string; password: string };
  creditedAmount?: number;
}) {
  return {
    accountId: result.accountId ?? null,
    username: result.credentials?.username ?? null,
    password: result.credentials?.password ?? null,
    credited: result.creditedAmount ?? null,
  };
}

export async function createPlayerAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return guarded("admin.createPlayer", async () => {
    const parsed = createPlayerSchema.safeParse({
      username: text(formData, "username"),
      displayName: text(formData, "displayName"),
      initialCredit: text(formData, "initialCredit"),
      idempotencyKey: text(formData, "idempotencyKey") || undefined,
    });
    if (!parsed.success) return { ok: false, fieldErrors: zodFieldErrors(parsed.error) };

    const result = await createPlayerAccount(parsed.data);
    if (!result.ok) {
      return { ok: false, messageKey: result.errorKey, fieldErrors: result.fieldErrors };
    }
    return done(["/admin/players", "/admin"], {
      ok: true,
      messageKey: "admin.players.created",
      data: credentialsData(result),
    });
  });
}

export async function createManagerAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return guarded("admin.createManager", async () => {
    const parsed = createManagerSchema.safeParse({
      username: text(formData, "username"),
      displayName: text(formData, "displayName"),
      initialCredit: text(formData, "initialCredit"),
      idempotencyKey: text(formData, "idempotencyKey") || undefined,
    });
    if (!parsed.success) return { ok: false, fieldErrors: zodFieldErrors(parsed.error) };

    const result = await createManagerAccount(parsed.data);
    if (!result.ok) {
      return { ok: false, messageKey: result.errorKey, fieldErrors: result.fieldErrors };
    }
    return done(["/admin/managers", "/admin"], {
      ok: true,
      messageKey: "admin.managers.created",
      data: credentialsData(result),
    });
  });
}

/** Replaces a player's or manager's password with a generated one, shown once. */
export async function resetCredentialsAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return guarded("admin.resetCredentials", async () => {
    const kind = text(formData, "kind") === "manager" ? "manager" : "player";
    const parsed = resetCredentialsSchema.safeParse({
      accountId: text(formData, "accountId"),
      confirm: readBoolean(formData.get("confirm")),
    });
    if (!parsed.success) return { ok: false, fieldErrors: zodFieldErrors(parsed.error) };

    const result = await resetCredentials(parsed.data.accountId, kind);
    if (!result.ok) return { ok: false, messageKey: result.errorKey };
    return done([`/admin/${kind === "manager" ? "managers" : "players"}/${parsed.data.accountId}`], {
      ok: true,
      messageKey: "admin.credentials.reset",
      data: {
        accountId: parsed.data.accountId,
        username: result.credentials?.username ?? null,
        password: result.credentials?.password ?? null,
      },
    });
  });
}

/** Superadmin → manager, or manager → player, depending on `direction`. */
async function creditAction(direction: "issue" | "sell", formData: FormData): Promise<ActionState> {
  const parsed = creditSchema.safeParse({
    accountId: text(formData, "accountId"),
    amount: text(formData, "amount"),
    note: text(formData, "note") || undefined,
    idempotencyKey: text(formData, "idempotencyKey") || undefined,
  });
  if (!parsed.success) return { ok: false, fieldErrors: zodFieldErrors(parsed.error) };

  const result =
    direction === "issue" ? await issueCreditToManager(parsed.data) : await sellCreditToPlayer(parsed.data);
  if (!result.ok) {
    return { ok: false, messageKey: result.errorKey, fieldErrors: result.fieldErrors };
  }
  return done(
    [
      `/admin/${direction === "issue" ? "managers" : "players"}/${parsed.data.accountId}`,
      "/admin/managers",
      "/admin/players",
      "/admin/transactions",
      "/admin",
    ],
    {
      ok: true,
      messageKey: direction === "issue" ? "admin.credit.issued" : "admin.credit.sold",
      data: {
        reference: result.reference ?? null,
        senderBalance: result.senderBalance ?? null,
        recipientBalance: result.recipientBalance ?? null,
      },
    },
  );
}

export async function issueCreditAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  return guarded("admin.issueCredit", () => creditAction("issue", formData));
}

export async function sellCreditAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  return guarded("admin.sellCredit", () => creditAction("sell", formData));
}

export async function managerStatusAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return guarded("admin.managerStatus", async () => {
    const intent = text(formData, "intent");
    const parsed = playerActionSchema.safeParse({
      playerId: text(formData, "playerId"),
      reason: text(formData, "reason"),
      confirm: readBoolean(formData.get("confirm")),
    });
    if (!parsed.success) return { ok: false, fieldErrors: zodFieldErrors(parsed.error) };
    if (intent !== "suspend" && intent !== "reactivate") {
      return { ok: false, messageKey: "common.validation.invalid" };
    }

    const result = await changeStatus(
      parsed.data.playerId,
      intent === "suspend" ? "SUSPENDED" : "ACTIVE",
      parsed.data.reason,
      "managers.update",
      "manager",
    );
    return done([`/admin/managers/${parsed.data.playerId}`, "/admin/managers"], {
      ok: result.ok,
      messageKey: result.ok ? `admin.players.${intent}Done` : result.errorKey,
    });
  });
}

export async function playerStatusAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return guarded("admin.playerStatus", async () => {
    const intent = text(formData, "intent");
    const parsed = playerActionSchema.safeParse({
      playerId: text(formData, "playerId"),
      reason: text(formData, "reason"),
      confirm: readBoolean(formData.get("confirm")),
    });
    if (!parsed.success) return { ok: false, fieldErrors: zodFieldErrors(parsed.error) };

    const { playerId, reason } = parsed.data;
    const result =
      intent === "suspend"
        ? await suspendPlayer(playerId, reason)
        : intent === "lock"
          ? await lockPlayer(playerId, reason)
          : intent === "reactivate" || intent === "unlock"
            ? await reactivatePlayer(playerId, reason)
            : { ok: false, errorKey: "common.validation.invalid" };

    return done([`/admin/players/${playerId}`, "/admin/players"], {
      ok: result.ok,
      messageKey: result.ok ? `admin.players.${intent}Done` : result.errorKey,
    });
  });
}

export async function restrictionsAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return guarded("admin.restrictions", async () => {
    const parsed = restrictionsSchema.safeParse({
      playerId: text(formData, "playerId"),
      wageringBlocked: readBoolean(formData.get("wageringBlocked")),
      withdrawalsBlocked: readBoolean(formData.get("withdrawalsBlocked")),
      reason: text(formData, "reason"),
    });
    if (!parsed.success) return { ok: false, fieldErrors: zodFieldErrors(parsed.error) };

    const result = await setPlayerRestrictions(parsed.data);
    return done([`/admin/players/${parsed.data.playerId}`], {
      ok: result.ok,
      messageKey: result.ok ? "admin.players.restrictionsSaved" : result.errorKey,
    });
  });
}

export async function verificationAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return guarded("admin.verification", async () => {
    const parsed = verificationSchema.safeParse({
      playerId: text(formData, "playerId"),
      status: text(formData, "status"),
      reason: text(formData, "reason"),
    });
    if (!parsed.success) return { ok: false, fieldErrors: zodFieldErrors(parsed.error) };

    const result = await setPlayerVerification(parsed.data);
    return done([`/admin/players/${parsed.data.playerId}`], {
      ok: result.ok,
      messageKey: result.ok ? "admin.players.verificationSaved" : result.errorKey,
    });
  });
}

export async function revokeSessionsAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return guarded("admin.revokeSessions", async () => {
    const playerId = text(formData, "playerId");
    const result = await revokePlayerSessions(playerId);
    return done([`/admin/players/${playerId}`], {
      ok: result.ok,
      messageKey: result.ok ? "admin.players.sessionsRevoked" : result.errorKey,
      data: { revoked: result.revoked ?? 0 },
    });
  });
}

/* ----------------------------------------------------------------- wallet */

export async function adjustWalletAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return guarded("admin.adjustWallet", async () => {
    const parsed = adjustmentSchema.safeParse({
      playerId: text(formData, "playerId"),
      type: text(formData, "type"),
      direction: text(formData, "direction") || undefined,
      amount: text(formData, "amount"),
      reason: text(formData, "reason"),
      reference: text(formData, "reference") || undefined,
      confirm: readBoolean(formData.get("confirm")),
      idempotencyKey: text(formData, "idempotencyKey") || undefined,
    });
    if (!parsed.success) return { ok: false, fieldErrors: zodFieldErrors(parsed.error) };

    const result = await adjustWallet(parsed.data);
    if (!result.ok) return { ok: false, messageKey: result.errorKey };

    return done(
      [`/admin/players/${parsed.data.playerId}`, "/admin/transactions", "/admin/wallet", "/admin"],
      {
        ok: true,
        messageKey: result.pendingApproval ? "admin.wallet.queuedForApproval" : "admin.wallet.applied",
        data: {
          reference: result.reference ?? null,
          balanceAfter: result.balanceAfter ?? null,
          pending: result.pendingApproval ?? false,
        },
      },
    );
  });
}

export async function decideAdjustmentAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return guarded("admin.decideAdjustment", async () => {
    const parsed = decisionSchema.safeParse({
      id: text(formData, "id"),
      decision: text(formData, "decision"),
      note: text(formData, "note") || undefined,
    });
    if (!parsed.success) return { ok: false, fieldErrors: zodFieldErrors(parsed.error) };

    const result = await decideAdjustment(parsed.data.id, parsed.data.decision, parsed.data.note);
    return done(["/admin/wallet", "/admin/transactions", "/admin"], {
      ok: result.ok,
      messageKey: result.ok ? `admin.wallet.${parsed.data.decision}Done` : result.errorKey,
    });
  });
}

export async function processWithdrawalAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return guarded("admin.processWithdrawal", async () => {
    const parsed = decisionSchema.safeParse({
      id: text(formData, "id"),
      decision: text(formData, "decision"),
      note: text(formData, "note") || undefined,
    });
    if (!parsed.success) return { ok: false, fieldErrors: zodFieldErrors(parsed.error) };

    const result = await processWithdrawal(parsed.data.id, parsed.data.decision, parsed.data.note);
    return done(["/admin/wallet", "/admin/withdrawals", "/admin/transactions", "/admin"], {
      ok: result.ok,
      messageKey: result.ok ? `admin.withdrawals.${parsed.data.decision}Done` : result.errorKey,
    });
  });
}

/* ------------------------------------------------------------------- bets */

export async function settleBetAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return guarded("admin.settleBet", async () => {
    // Leg results arrive as `leg:<legId>` fields.
    const results: Record<string, string> = {};
    for (const [key, value] of formData.entries()) {
      if (key.startsWith("leg:") && typeof value === "string") results[key.slice(4)] = value;
    }
    const parsed = settleBetSchema.safeParse({
      betId: text(formData, "betId"),
      results,
      confirm: readBoolean(formData.get("confirm")),
    });
    if (!parsed.success) return { ok: false, fieldErrors: zodFieldErrors(parsed.error) };

    const result = await settleBet(parsed.data.betId, parsed.data.results);
    return done(["/admin/bets", "/admin", "/admin/transactions"], {
      ok: result.ok,
      messageKey: result.ok ? "admin.bets.settled" : result.errorKey,
      data: { payout: result.payout ?? null, status: result.status ?? null },
    });
  });
}

/* --------------------------------------------------------------- settings */

export async function updateSettingsAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return guarded("admin.updateSettings", async () => {
    // The form lists the keys it is submitting; each is coerced by its definition.
    const { SETTING_BY_KEY } = await import("@/server/settings/registry");
    const patch: Record<string, unknown> = {};

    for (const key of formData.getAll("keys")) {
      if (typeof key !== "string") continue;
      const definition = SETTING_BY_KEY.get(key);
      if (!definition) continue;

      if (definition.type === "boolean") patch[key] = readBoolean(formData.get(key));
      else if (definition.type === "multi") {
        patch[key] = formData.getAll(key).filter((v): v is string => typeof v === "string");
      } else patch[key] = Number(text(formData, key).replace(",", "."));
    }

    const result = await updateSettings(patch);
    return done(["/admin/settings"], {
      ok: result.ok,
      messageKey: result.ok ? "admin.settings.saved" : result.errorKey,
      data: { invalid: result.invalid?.join(",") ?? null },
    });
  });
}

/* ----------------------------------------------------------------- search */

export interface AdminSearchState {
  ok: boolean;
  results: Awaited<ReturnType<typeof searchAdmin>>;
}

/** Header search. Results are filtered by what the caller's role may read. */
export async function adminSearchAction(query: string): Promise<AdminSearchState> {
  try {
    return { ok: true, results: await searchAdmin(query.slice(0, 64)) };
  } catch {
    return { ok: false, results: [] };
  }
}
