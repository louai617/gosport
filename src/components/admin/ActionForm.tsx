"use client";

import { useEffect, useRef, type ReactNode } from "react";
import type { ActionState } from "@/lib/actionState";
import { useFormAction } from "@/lib/useFormAction";
import { useT } from "@/i18n/I18nProvider";
import { Alert } from "@/components/ui/Alert";
import { Button, type ButtonProps } from "@/components/ui/Button";

export interface ActionFormApi {
  state: ActionState;
  /** Translated field error, if the server reported one for `name`. */
  error: (name: string) => string | undefined;
}

export interface ActionFormProps {
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  submitLabel: string;
  variant?: ButtonProps["variant"];
  className?: string;
  /** Rendered inside the success alert, after the message. */
  onSuccess?: (state: ActionState) => ReactNode;
  children: (api: ActionFormApi) => ReactNode;
}

/**
 * Boilerplate every admin form shares: pending state, a form-level message, and
 * per-field errors translated from the keys the server returns. The form itself
 * decides nothing — validation and authorisation happen in the action.
 */
export function ActionForm({
  action,
  submitLabel,
  variant = "primary",
  className,
  onSuccess,
  children,
}: ActionFormProps) {
  const t = useT();
  const { state, pending, formProps } = useFormAction(action);
  const form = useRef<HTMLFormElement>(null);

  // A form that succeeded starts clean for the next entry; one that failed keeps
  // exactly what was typed.
  useEffect(() => {
    if (state.ok) form.current?.reset();
  }, [state]);

  const error = (name: string) => (state.fieldErrors?.[name] ? t(state.fieldErrors[name]) : undefined);

  return (
    <form ref={form} {...formProps} className={className ?? "space-y-3"} noValidate>
      {state.messageKey ? (
        <Alert tone={state.ok ? "success" : "danger"}>
          {t(state.messageKey)}
          {state.ok ? onSuccess?.(state) : null}
        </Alert>
      ) : null}

      {children({ state, error })}

      <Button type="submit" variant={variant} loading={pending}>
        {submitLabel}
      </Button>
    </form>
  );
}
