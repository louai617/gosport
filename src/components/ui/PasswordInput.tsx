"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/cn";
import { useT } from "@/i18n/I18nProvider";
import { Input, type InputProps } from "./Input";

export interface PasswordInputProps extends Omit<InputProps, "type" | "suffix" | "footer"> {
  showLabel?: string;
  hideLabel?: string;
  /** 0–4. Omit entirely on sign-in forms — strength only belongs on sign-up. */
  strength?: number;
}

const STRENGTH_FILL = [
  "bg-danger",
  "bg-danger",
  "bg-warning",
  "bg-success",
] as const;

export function PasswordInput({
  showLabel,
  hideLabel,
  strength,
  className,
  ...props
}: PasswordInputProps) {
  const t = useT();
  const [visible, setVisible] = useState(false);

  const toggleLabel = visible
    ? (hideLabel ?? t("ui.hidePassword"))
    : (showLabel ?? t("ui.showPassword"));

  return (
    <Input
      {...props}
      type={visible ? "text" : "password"}
      className={cn("pe-11", className)}
      suffix={
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-label={toggleLabel}
          title={toggleLabel}
          aria-pressed={visible}
          className="inline-flex size-8 cursor-pointer items-center justify-center rounded-sm text-ink-subtle transition-colors duration-fast hover:text-ink"
        >
          {visible ? (
            <EyeOff className="size-4" aria-hidden="true" />
          ) : (
            <Eye className="size-4" aria-hidden="true" />
          )}
        </button>
      }
      footer={
        typeof strength === "number" ? (
          <div className="flex gap-1" aria-hidden="true">
            {[0, 1, 2, 3].map((segment) => (
              <span
                key={segment}
                className={cn(
                  "h-1 flex-1 rounded-full transition-colors duration-base",
                  segment < strength
                    ? STRENGTH_FILL[Math.min(strength, 4) - 1]
                    : "bg-surface-3",
                )}
              />
            ))}
          </div>
        ) : null
      }
    />
  );
}
