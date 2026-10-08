"use client";

import { managerStatusAction } from "@/app/actions/admin";
import { useT } from "@/i18n/I18nProvider";
import { Checkbox } from "@/components/ui/Checkbox";
import { Textarea } from "@/components/ui/Textarea";
import { ActionForm } from "./ActionForm";
import { ResetCredentialsForm } from "./ResetCredentialsForm";

/** Everything the superadmin can do to one manager's account. */
export function ManagerActions({
  manager,
}: {
  manager: { id: string; username: string; status: string };
}) {
  const t = useT();
  const suspended = manager.status === "suspended";

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h3 className="text-small font-semibold text-ink">{t("admin.credentials.title")}</h3>
        <ResetCredentialsForm accountId={manager.id} username={manager.username} kind="manager" />
      </section>

      <section className="space-y-2 border-t border-line-soft pt-5">
        <h3 className="text-small font-semibold text-ink">{t("admin.players.accessControl")}</h3>
        <ActionForm
          action={managerStatusAction}
          submitLabel={suspended ? t("admin.players.reactivate") : t("admin.players.suspend")}
          variant={suspended ? "primary" : "danger"}
        >
          {({ error }) => (
            <>
              <input type="hidden" name="playerId" value={manager.id} />
              <input type="hidden" name="intent" value={suspended ? "reactivate" : "suspend"} />
              {!suspended ? <p className="text-small text-ink-muted">{t("admin.managers.suspendHint")}</p> : null}
              <Textarea name="reason" rows={2} label={t("admin.wallet.reason")} error={error("reason")} />
              <Checkbox
                name="confirm"
                label={t(suspended ? "admin.players.confirmReactivate" : "admin.players.confirmSuspend", {
                  username: manager.username,
                })}
                error={error("confirm")}
              />
            </>
          )}
        </ActionForm>
      </section>
    </div>
  );
}
