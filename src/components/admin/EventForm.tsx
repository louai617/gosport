"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { useT } from "@/i18n/I18nProvider";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";

export interface EventFormLauncherProps {
  sports: Array<{ id: string; label: string }>;
}

const STATUSES = ["scheduled", "live", "finished", "cancelled"] as const;

/**
 * Create-event dialog.
 *
 * The fields, validation shape and status vocabulary are real; the submit is
 * not. `adminService` mutations return `admin.error.readOnlyDemo` because the
 * demo dataset is regenerated from a seed on every request — persisting a row
 * into it would vanish on the next tick and would misrepresent what the build
 * does. The form exists so the interface can be reviewed and so the eventual
 * handler has a shape to bind to.
 */
export function EventFormLauncher({ sports }: EventFormLauncherProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  return (
    <>
      <Button size="sm" iconStart={<Plus size={15} />} onClick={() => setOpen(true)}>
        {t("admin.events.create")}
      </Button>

      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          setSubmitted(false);
        }}
        title={t("admin.events.create")}
        description={t("admin.events.createDescription")}
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
            <Alert tone="warning">{t("admin.events.demoNotice")}</Alert>
          )}

          <Select
            name="sportId"
            required
            label={t("admin.column.sport")}
            options={sports.map((sport) => ({ value: sport.id, label: sport.label }))}
          />

          <Input name="competition" required label={t("admin.column.competition")} />

          <div className="grid gap-4 sm:grid-cols-2">
            <Input name="homeTeam" required label={t("admin.field.homeTeam")} />
            <Input name="awayTeam" required label={t("admin.field.awayTeam")} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              name="startTime"
              type="datetime-local"
              required
              label={t("admin.column.startTime")}
            />
            <Select
              name="status"
              required
              defaultValue="scheduled"
              label={t("admin.column.status")}
              options={STATUSES.map((value) => ({
                value,
                label: t(`status.${value}`),
              }))}
            />
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
