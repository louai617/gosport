import { fail } from "@/server/api";

/** Maps a service result that failed onto the uniform API error. */
export function failFromResult(result: {
  errorKey?: string;
  fieldErrors?: Record<string, string>;
}) {
  return fail("validation_failed", result.errorKey ?? "common.error.checkFields", {
    fields: Object.entries(result.fieldErrors ?? {}).map(([field, messageKey]) => ({ field, messageKey })),
  });
}
