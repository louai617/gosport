"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Eye, EyeOff, Wallet } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatAmount } from "@/lib/format";
import { useI18n } from "@/i18n/I18nProvider";

const HIDDEN_KEY = "sportgo.balance.hidden";
const MASK = "••••••";

export interface BalanceDisplayProps {
  /** The wallet balance. Read from `paymentService.getWallet()` upstream —
   *  this component holds no balance state of its own. */
  balance: number;
  /** `bar` is the navbar pill; `block` is the full-width drawer row. */
  variant?: "bar" | "block";
  href?: string;
  className?: string;
}

/**
 * Account balance in the navigation.
 *
 * Two elements, not one: the amount is a link to the wallet and the eye is a
 * button. Nesting a button inside an anchor is invalid and leaves the inner
 * control unreachable by keyboard in some browsers, so they sit side by side
 * inside a shared shell.
 *
 * The visibility preference is per-device display state and lives in
 * localStorage — deliberately not in the wallet, which is server data.
 */
export function BalanceDisplay({
  balance,
  variant = "bar",
  href = "/wallet",
  className,
}: BalanceDisplayProps) {
  const { t, locale } = useI18n();
  const [hidden, setHidden] = useState(false);

  // Read after mount: the server cannot know this, and using it in the first
  // render would mismatch during hydration.
  useEffect(() => {
    try {
      setHidden(localStorage.getItem(HIDDEN_KEY) === "1");
    } catch {
      // Blocked storage — the balance simply stays visible.
    }
  }, []);

  const toggle = () => {
    const next = !hidden;
    setHidden(next);
    try {
      localStorage.setItem(HIDDEN_KEY, next ? "1" : "0");
    } catch {
      // Non-fatal.
    }
  };

  const amount = formatAmount(balance, locale);
  const shown = hidden ? MASK : amount;
  const isBar = variant === "bar";

  return (
    <div
      className={cn(
        "flex items-center rounded-md border border-line bg-surface-2 transition-colors duration-fast hover:border-line-strong",
        isBar ? "h-9" : "h-auto w-full",
        className,
      )}
    >
      <Link
        href={href}
        className={cn(
          "flex min-w-0 items-center gap-2 rounded-s-md transition-colors duration-fast hover:bg-surface-3",
          isBar ? "h-full ps-2.5 pe-1.5" : "flex-1 p-3",
        )}
      >
        <Wallet
          size={isBar ? 15 : 17}
          aria-hidden="true"
          className="shrink-0 text-ink-subtle"
        />

        <span className="flex min-w-0 flex-col justify-center leading-none">
          <span className="hidden text-caption uppercase text-ink-subtle xl:block">
            {t("account.balance.title")}
          </span>
          <span
            className={cn(
              "numeric truncate font-semibold text-ink",
              isBar ? "mt-0.5 text-small" : "mt-1 text-h3",
            )}
          >
            {/* The masked form is decorative; screen readers get the real
                figure either way, since hiding is a shoulder-surfing measure
                rather than a privacy boundary. */}
            <span aria-hidden={hidden || undefined}>{shown}</span>
            {hidden ? <span className="sr-only">{amount}</span> : null}
          </span>
        </span>
      </Link>

      <button
        type="button"
        onClick={toggle}
        aria-pressed={hidden}
        aria-label={hidden ? t("account.balance.show") : t("account.balance.hide")}
        className={cn(
          "grid shrink-0 cursor-pointer place-items-center rounded-e-md text-ink-subtle transition-colors duration-fast hover:bg-surface-3 hover:text-ink",
          isBar ? "h-full w-8" : "h-11 w-11",
        )}
      >
        {hidden ? (
          <EyeOff size={14} aria-hidden="true" />
        ) : (
          <Eye size={14} aria-hidden="true" />
        )}
      </button>
    </div>
  );
}
