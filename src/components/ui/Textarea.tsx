"use client";

import { useId, type ComponentPropsWithRef } from "react";
import { cn } from "@/lib/cn";
import { FIELD_CONTROL, FieldLabel, FieldMessage } from "./Input";

export interface TextareaProps extends ComponentPropsWithRef<"textarea"> {
  label?: string;
  hint?: string;
  error?: string;
}

export function Textarea({
  label,
  hint,
  error,
  id,
  rows = 4,
  className,
  ...props
}: TextareaProps) {
  const generatedId = useId();
  const textareaId = id ?? generatedId;
  const hintId = `${textareaId}-hint`;
  const errorId = `${textareaId}-error`;

  return (
    <div className="space-y-1.5">
      {label ? <FieldLabel htmlFor={textareaId}>{label}</FieldLabel> : null}

      <textarea
        id={textareaId}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : hint ? hintId : undefined}
        className={cn(
          FIELD_CONTROL,
          "scroll-slim min-h-24 resize-y px-3 py-2.5 text-small leading-relaxed",
          className,
        )}
        {...props}
      />

      <FieldMessage hint={hint} error={error} hintId={hintId} errorId={errorId} />
    </div>
  );
}
