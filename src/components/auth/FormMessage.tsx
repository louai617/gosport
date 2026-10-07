"use client";

import type { ActionState } from "@/lib/actionState";
import { useT } from "@/i18n/I18nProvider";
import { Alert } from "@/components/ui/Alert";

export interface FormMessageProps {
  state: ActionState;
}

/** Renders the form-level outcome. Field errors are shown on the fields. */
export function FormMessage({ state }: FormMessageProps) {
  const t = useT();
  if (!state.messageKey) return null;

  return (
    <Alert tone={state.ok ? "success" : "danger"} className="mb-4">
      {t(state.messageKey)}
    </Alert>
  );
}
