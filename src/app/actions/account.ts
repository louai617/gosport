"use server";

import { revalidatePath } from "next/cache";

import type { ActionState } from "@/lib/actionState";
import { guarded, text } from "@/server/actions";
import {
  markAllNotificationsRead,
  markNotificationRead,
} from "@/services/notificationService";
import { updateOwnProfile } from "@/services/userService";

/** Self-service actions for the signed-in user: profile and notifications. */

export async function updateProfileAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return guarded("account.profile", async () => {
    const result = await updateOwnProfile({
      displayName: text(formData, "displayName"),
    });
    if (result.ok) revalidatePath("/account/profile");
    return {
      ok: result.ok,
      messageKey: result.ok ? "account.profile.saved" : result.errorKey,
      fieldErrors: result.fieldErrors,
    };
  });
}

export async function markNotificationReadAction(id: string): Promise<ActionState> {
  return guarded("account.notificationRead", async () => {
    const result = await markNotificationRead(id);
    revalidatePath("/account/notifications");
    return { ok: result.ok, messageKey: result.errorKey };
  });
}

export async function markAllNotificationsReadAction(): Promise<ActionState> {
  return guarded("account.notificationsReadAll", async () => {
    await markAllNotificationsRead();
    revalidatePath("/account/notifications");
    return { ok: true };
  });
}


/** `<form action>` variant: a form action must return `void`, so this wraps the one above. */
export async function markAllNotificationsReadFormAction(): Promise<void> {
  await markAllNotificationsReadAction();
}
