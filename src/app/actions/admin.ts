"use server";

import { revalidatePath } from "next/cache";

import type { ActionState } from "@/lib/actionState";
import {
  adjustmentSchema,
  createPlayerSchema,
  decisionSchema,
  playerActionSchema,
  restrictionsSchema,
  settleBetSchema,
  updatePlayerSchema,
  verificationSchema,
} from "@/lib/adminValidation";
import { guarded, readBoolean, text, zodFieldErrors } from "@/server/actions";
import { updateSettings } from "@/server/settings/settingsService";
import {
  createCredentialLink,
  createPlayer,
  lockPlayer,
  reactivatePlayer,
  revokePlayerSessions,
  setPlayerRestrictions,
  setPlayerVerification,
  suspendPlayer,
  updatePlayer,
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

export async function createPlayerAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return guarded("admin.createPlayer", async () => {
    const parsed = createPlayerSchema.safeParse({
      username: text(formData, "username"),
      email: text(formData, "email"),
      phone: text(formData, "phone"),
      firstName: text(formData, "firstName"),
      lastName: text(formData, "lastName"),
      country: text(formData, "country"),
      locale: text(formData, "locale") || "fr",
      credentialMode: text(formData, "credentialMode"),
      temporaryPassword: text(formData, "temporaryPassword"),
    });
    if (!parsed.success) return { ok: false, fieldErrors: zodFieldErrors(parsed.error) };

    const result = await createPlayer(parsed.data);
    if (!result.ok) {
      return { ok: false, messageKey: result.errorKey, fieldErrors: result.fieldErrors };
    }
    return done(["/admin/players"], {
      ok: true,
      messageKey: "admin.players.created",
      data: {
        playerId: result.playerId ?? null,
        username: result.username ?? null,
        invitationLink: result.invitationLink ?? null,
        delivered: result.delivered ?? false,
      },
    });
  });
}

export async function updatePlayerAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return guarded("admin.updatePlayer", async () => {
    const parsed = updatePlayerSchema.safeParse({
      playerId: text(formData, "playerId"),
      email: text(formData, "email"),
      phone: text(formData, "phone"),
      firstName: text(formData, "firstName"),
      lastName: text(formData, "lastName"),
      displayName: text(formData, "displayName"),
      country: text(formData, "country"),
      locale: text(formData, "locale"),
      reason: text(formData, "reason"),
    });
    if (!parsed.success) return { ok: false, fieldErrors: zodFieldErrors(parsed.error) };

    const result = await updatePlayer(parsed.data);
    return done([`/admin/players/${parsed.data.playerId}`], {
      ok: result.ok,
      messageKey: result.ok ? "admin.players.updated" : result.errorKey,
      fieldErrors: result.fieldErrors,
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

export async function credentialLinkAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return guarded("admin.credentialLink", async () => {
    const result = await createCredentialLink(text(formData, "playerId"));
    return result.ok
      ? { ok: true, messageKey: "admin.players.linkCreated", data: { link: result.link ?? null } }
      : { ok: false, messageKey: result.errorKey };
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
    return done(["/admin/wallet", "/admin/transactions", "/admin"], {
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
