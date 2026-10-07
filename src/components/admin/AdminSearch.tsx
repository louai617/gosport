"use client";

import { useEffect, useId, useState, useTransition } from "react";
import Link from "next/link";
import { Loader2, Receipt, Search, UserRound, Wallet } from "lucide-react";
import { adminSearchAction, type AdminSearchState } from "@/app/actions/admin";
import { useT } from "@/i18n/I18nProvider";

const ICON = { player: UserRound, transaction: Wallet, bet: Receipt } as const;

/**
 * Operator search: players, transactions and tickets in one box. The server
 * decides what the caller may see — this only renders what comes back.
 */
export function AdminSearch() {
  const t = useT();
  const id = useId();
  const [query, setQuery] = useState("");
  const [state, setState] = useState<AdminSearchState | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (query.trim().length < 2) {
      setState(null);
      return;
    }
    const timer = window.setTimeout(() => {
      startTransition(async () => setState(await adminSearchAction(query)));
    }, 220);
    return () => window.clearTimeout(timer);
  }, [query]);

  return (
    <div className="relative hidden max-w-sm flex-1 md:block">
      <label htmlFor={id} className="sr-only">
        {t("admin.search.label")}
      </label>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 start-2.5 flex items-center text-ink-subtle"
      >
        {pending ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
      </span>
      <input
        id={id}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        onKeyDown={(event) => event.key === "Escape" && setOpen(false)}
        placeholder={t("admin.search.placeholder")}
        autoComplete="off"
        className="h-9 w-full rounded-md border border-line bg-surface-2 ps-9 pe-3 text-small text-ink placeholder:text-ink-subtle hover:border-line-strong focus:border-primary"
      />

      {open && query.trim().length >= 2 && state ? (
        <div className="absolute inset-x-0 top-full z-50 mt-1 overflow-hidden rounded-lg border border-line bg-surface shadow-e3">
          {state.results.length === 0 ? (
            <p className="px-3 py-3 text-small text-ink-subtle">{t("admin.search.empty")}</p>
          ) : (
            <ul className="scroll-slim max-h-80 overflow-y-auto" aria-live="polite">
              {state.results.map((result) => {
                const Icon = ICON[result.kind];
                return (
                  <li key={`${result.kind}:${result.id}`}>
                    <Link
                      href={result.href}
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-2.5 px-3 py-2 transition-colors duration-fast hover:bg-surface-2"
                    >
                      <Icon size={15} aria-hidden="true" className="shrink-0 text-ink-subtle" />
                      <span className="min-w-0">
                        <span className="block truncate text-small font-medium text-ink">{result.title}</span>
                        <span className="block truncate text-caption normal-case tracking-normal text-ink-subtle">
                          {result.subtitle}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
