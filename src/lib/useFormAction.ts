"use client";

import { useActionState, useTransition, type FormEvent } from "react";
import { emptyActionState, type ActionState } from "@/lib/actionState";

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;

/**
 * `useActionState` for a form, minus React's automatic reset.
 *
 * React 19 resets an uncontrolled form after its action finishes — *even when the
 * action reported a validation error*, which wipes a long registration form (or
 * the reason an administrator just typed) because one field was wrong. Here the
 * submit is dispatched by hand, so the fields keep what the user typed.
 *
 * `formProps` still carries the server action as `action`: before the page has
 * hydrated (or with scripting off) the browser does a real POST to the action,
 * so a form never degrades to a GET that would put a password in the URL.
 */
export function useFormAction(action: Action) {
  const [state, dispatch, pending] = useActionState(action, emptyActionState);
  const [, startTransition] = useTransition();

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    // Passing the submitter keeps `name`/`value` of the clicked button (approve vs reject).
    const data = new FormData(event.currentTarget, submitter as HTMLElement | null);
    startTransition(() => dispatch(data));
  };

  return { state, pending, formProps: { action: dispatch, onSubmit } };
}
