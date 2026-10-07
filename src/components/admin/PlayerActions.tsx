"use client";

import {
  credentialLinkAction,
  playerStatusAction,
  restrictionsAction,
  revokeSessionsAction,
  updatePlayerAction,
  verificationAction,
} from "@/app/actions/admin";
import type { PlayerDetail } from "@/services/playerAdminService";
import { LOCALE_META } from "@/i18n/config";
import { useT } from "@/i18n/I18nProvider";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { ActionForm } from "./ActionForm";
import { OneTimeLink } from "./OneTimeLink";

const COUNTRIES = ["TN", "DZ", "MA", "FR", "IT", "DE"] as const;
const LOCALES = ["fr", "ar", "en"] as const;
const KYC = ["NOT_STARTED", "PENDING", "VERIFIED", "REJECTED", "EXPIRED"] as const;

function Section({
  title,
  description,
  tone = "default",
  children,
}: {
  title: string;
  description?: string;
  tone?: "default" | "danger";
  children: React.ReactNode;
}) {
  return (
    <details
      className={`group rounded-xl border bg-surface ${tone === "danger" ? "border-danger/30" : "border-line"}`}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
        <span>
          <span className="block text-small font-semibold text-ink">{title}</span>
          {description ? (
            <span className="block text-caption normal-case tracking-normal text-ink-subtle">{description}</span>
          ) : null}
        </span>
        <span aria-hidden="true" className="text-ink-subtle transition-transform duration-fast group-open:rotate-180">
          ▾
        </span>
      </summary>
      <div className="border-t border-line-soft p-4">{children}</div>
    </details>
  );
}

/**
 * Everything an operator can do to one player, each behind its own form with a
 * reason and an explicit confirmation. None of these buttons is authority: the
 * actions re-check the caller's permission on the server and audit the result.
 */
export function PlayerActions({
  player,
  can,
}: {
  player: PlayerDetail;
  can: { update: boolean; suspend: boolean; credentials: boolean; sessions: boolean };
}) {
  const t = useT();
  const suspended = player.status === "suspended";
  const locked = player.status === "locked";
  const blockable = !["closed", "pending"].includes(player.status);

  return (
    <div className="space-y-3">
      {can.update ? (
        <Section title={t("admin.players.edit")} description={t("admin.players.editHint")}>
          <ActionForm action={updatePlayerAction} submitLabel={t("admin.players.saveChanges")}>
            {({ error }) => (
              <>
                <input type="hidden" name="playerId" value={player.id} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input name="firstName" defaultValue={player.firstName} label={t("auth.field.firstName")} error={error("firstName")} />
                  <Input name="lastName" defaultValue={player.lastName} label={t("auth.field.lastName")} error={error("lastName")} />
                  <Input name="displayName" defaultValue={player.displayName} label={t("account.profile.displayName")} error={error("displayName")} />
                  <Input name="email" type="email" defaultValue={player.email} label={t("auth.field.email")} hint={t("admin.players.emailWarning")} error={error("email")} />
                  <Input name="phone" defaultValue={player.phone ?? ""} label={t("auth.field.phone")} error={error("phone")} />
                  <Select
                    name="country"
                    defaultValue={player.countryCode}
                    label={t("auth.field.country")}
                    options={COUNTRIES.map((code) => ({ value: code, label: t(`countries.${code}`) }))}
                  />
                  <Select
                    name="locale"
                    defaultValue={player.locale}
                    label={t("admin.players.language")}
                    options={LOCALES.map((code) => ({ value: code, label: LOCALE_META[code].label }))}
                  />
                </div>
                <Textarea name="reason" rows={2} label={t("admin.wallet.reason")} hint={t("admin.players.changeReasonHint")} error={error("reason")} />
              </>
            )}
          </ActionForm>
        </Section>
      ) : null}

      {can.update ? (
        <Section title={t("admin.players.restrictions")} description={t("admin.players.restrictionsHint")}>
          <ActionForm action={restrictionsAction} submitLabel={t("admin.players.saveRestrictions")}>
            {({ error }) => (
              <>
                <input type="hidden" name="playerId" value={player.id} />
                <Checkbox name="wageringBlocked" defaultChecked={player.wageringBlocked} label={t("admin.players.blockWagering")} />
                <Checkbox name="withdrawalsBlocked" defaultChecked={player.withdrawalsBlocked} label={t("admin.players.blockWithdrawals")} />
                <Textarea name="reason" rows={2} label={t("admin.wallet.reason")} error={error("reason")} />
              </>
            )}
          </ActionForm>
        </Section>
      ) : null}

      {can.update ? (
        <Section title={t("admin.players.verification")} description={t("admin.players.verificationHint")}>
          <ActionForm action={verificationAction} submitLabel={t("admin.players.saveVerification")}>
            {({ error }) => (
              <>
                <input type="hidden" name="playerId" value={player.id} />
                <Select
                  name="status"
                  defaultValue={player.kycStatus.toUpperCase()}
                  label={t("admin.column.kyc")}
                  options={KYC.map((value) => ({ value, label: t(`admin.kyc.${value.toLowerCase()}`) }))}
                />
                <Textarea name="reason" rows={2} label={t("admin.wallet.reason")} error={error("reason")} />
              </>
            )}
          </ActionForm>
        </Section>
      ) : null}

      {can.credentials || can.sessions ? (
        <Section title={t("admin.players.security")} description={t("admin.players.securityHint")}>
          <div className="space-y-5">
            {can.credentials ? (
              <ActionForm
                action={credentialLinkAction}
                submitLabel={player.status === "pending" ? t("admin.players.newInvitation") : t("admin.players.resetLink")}
                variant="secondary"
                onSuccess={(state) =>
                  state.data?.link ? (
                    <span className="mt-2 block space-y-1.5">
                      <OneTimeLink link={String(state.data.link)} />
                      <span className="block text-caption normal-case tracking-normal">{t("admin.link.shownOnce")}</span>
                    </span>
                  ) : null
                }
              >
                {() => (
                  <>
                    <input type="hidden" name="playerId" value={player.id} />
                    <p className="text-small text-ink-muted">{t("admin.players.resetLinkHint")}</p>
                  </>
                )}
              </ActionForm>
            ) : null}

            {can.sessions ? (
              <ActionForm action={revokeSessionsAction} submitLabel={t("admin.players.revokeSessions")} variant="secondary">
                {() => (
                  <>
                    <input type="hidden" name="playerId" value={player.id} />
                    <p className="text-small text-ink-muted">
                      {t("admin.players.revokeSessionsHint", { count: player.activeSessions })}
                    </p>
                  </>
                )}
              </ActionForm>
            ) : null}
          </div>
        </Section>
      ) : null}

      {can.suspend && blockable ? (
        <Section title={t("admin.players.accessControl")} description={t("admin.players.accessControlHint")} tone="danger">
          <div className="space-y-5">
            {suspended || locked ? (
              <ActionForm action={playerStatusAction} submitLabel={t("admin.players.reactivate")}>
                {({ error }) => (
                  <>
                    <input type="hidden" name="playerId" value={player.id} />
                    <input type="hidden" name="intent" value="reactivate" />
                    <Textarea name="reason" rows={2} label={t("admin.wallet.reason")} error={error("reason")} />
                    <Checkbox name="confirm" label={t("admin.players.confirmReactivate", { username: player.username })} error={error("confirm")} />
                  </>
                )}
              </ActionForm>
            ) : (
              <>
                <ActionForm action={playerStatusAction} submitLabel={t("admin.players.suspend")} variant="danger">
                  {({ error }) => (
                    <>
                      <input type="hidden" name="playerId" value={player.id} />
                      <input type="hidden" name="intent" value="suspend" />
                      <p className="text-small text-ink-muted">{t("admin.players.suspendHint")}</p>
                      <Textarea name="reason" rows={2} label={t("admin.wallet.reason")} error={error("reason")} />
                      <Checkbox name="confirm" label={t("admin.players.confirmSuspend", { username: player.username })} error={error("confirm")} />
                    </>
                  )}
                </ActionForm>
                <ActionForm action={playerStatusAction} submitLabel={t("admin.players.lock")} variant="secondary">
                  {({ error }) => (
                    <>
                      <input type="hidden" name="playerId" value={player.id} />
                      <input type="hidden" name="intent" value="lock" />
                      <p className="text-small text-ink-muted">{t("admin.players.lockHint")}</p>
                      <Textarea name="reason" rows={2} label={t("admin.wallet.reason")} error={error("reason")} />
                      <Checkbox name="confirm" label={t("admin.players.confirmLock", { username: player.username })} error={error("confirm")} />
                    </>
                  )}
                </ActionForm>
              </>
            )}
          </div>
        </Section>
      ) : null}

    </div>
  );
}
