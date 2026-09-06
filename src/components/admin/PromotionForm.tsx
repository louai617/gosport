"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { useT } from "@/i18n/I18nProvider";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";

const KINDS = ["welcome", "sport", "weekend", "live", "loyalty", "seasonal"] as const;
const STATUSES = ["active", "scheduled", "disabled"] as const;

/**
 * Create-promotion dialog.
 *
 * Same posture as the event form: real shape, refusing submit. A promotion is
 * also a regulated artefact — every offer needs advertising review before it
 * can be published, which is why `admin.promotions.reviewNotice` sits in the
 * form rather than in a runbook nobody reads.
 */
export function PromotionFormLauncher() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  return (
    <>
      <Button size="sm" iconStart={<Plus size={15} />} onClick={() => setOpen(true)}>
        {t("admin.promotions.create")}
      </Button>

      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          setSubmitted(false);
        }}
        title={t("admin.promotions.create")}
        description={t("admin.promotions.createDescription")}
        size="md"
      >
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            setSubmitted(true);
          }}
        >
          {submitted ? (
            <Alert tone="danger">{t("admin.error.readOnlyDemo")}</Alert>
          ) : (
            <Alert tone="warning">{t("admin.promotions.reviewNotice")}</Alert>
          )}

          <Input name="slug" required label={t("admin.field.slug")} />
          <Input name="title" required label={t("admin.field.title")} />
          <Textarea name="summary" rows={3} label={t("admin.field.summary")} />

          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              name="kind"
              required
              label={t("admin.column.kind")}
              options={KINDS.map((value) => ({
                value,
                label: t(`admin.promoKind.${value}`),
              }))}
            />
            <Select
              name="status"
              required
              defaultValue="scheduled"
              label={t("admin.column.status")}
              options={STATUSES.map((value) => ({
                value,
                label: t(`promotions.status.${value}`),
              }))}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Input name="startsAt" type="date" required label={t("admin.column.starts")} />
            <Input name="endsAt" type="date" label={t("admin.column.ends")} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t("ui.cancel")}
            </Button>
            <Button type="submit">{t("ui.save")}</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
