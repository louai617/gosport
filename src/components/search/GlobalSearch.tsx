"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search, X } from "lucide-react";
import type { SearchResponse, SearchResult } from "@/services/types";
import { searchAction } from "@/app/actions/search";
import { cn } from "@/lib/cn";
import { useT } from "@/i18n/I18nProvider";
import { SportIcon } from "@/components/sports/SportIcon";

export interface GlobalSearchProps {
  className?: string;
  /** Renders full width without the ⌘K hint — used inside the mobile drawer. */
  variant?: "header" | "block";
}

const DEBOUNCE_MS = 220;

const KIND_ICON: Record<SearchResult["kind"], string> = {
  sport: "grid",
  competition: "trophy",
  team: "star",
  event: "trophy",
};

/**
 * Combobox over teams, competitions, sports and fixtures.
 *
 * Implements the ARIA 1.2 combobox pattern rather than a styled input with a
 * list underneath: arrow keys move a virtual focus via `aria-activedescendant`
 * while the caret stays in the field, which is what lets a keyboard user type
 * and choose without leaving the input.
 */
export function GlobalSearch({ className, variant = "header" }: GlobalSearchProps) {
  const t = useT();
  const router = useRouter();
  const id = useId();

  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (query.trim().length < 2) {
      setResponse(null);
      return;
    }

    const timer = window.setTimeout(() => {
      startTransition(async () => {
        const result = await searchAction(query);
        setResponse(result);
        setActiveIndex(-1);
      });
    }, DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [query]);

  // ⌘K / Ctrl-K focuses the field from anywhere.
  useEffect(() => {
    if (variant !== "header") return;

    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [variant]);

  const results = response?.results ?? [];

  const go = (result: SearchResult) => {
    setOpen(false);
    setQuery("");
    router.push(result.href);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (results.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + results.length) % results.length);
    } else if (event.key === "Enter") {
      const chosen = results[activeIndex];
      if (chosen) {
        event.preventDefault();
        go(chosen);
      }
    }
  };

  const showPanel = open && query.trim().length >= 2;

  return (
    <div className={cn("relative", className)}>
      <div
        role="combobox"
        aria-expanded={showPanel}
        aria-owns={`${id}-listbox`}
        aria-haspopup="listbox"
        className="relative flex items-center"
      >
        <Search
          size={15}
          aria-hidden="true"
          className="pointer-events-none absolute start-3 text-ink-subtle"
        />

        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKeyDown}
          placeholder={t("ui.searchPlaceholder")}
          aria-label={t("nav.search")}
          aria-autocomplete="list"
          aria-controls={`${id}-listbox`}
          aria-activedescendant={
            activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined
          }
          className="h-9 w-full rounded-md border border-line bg-surface-2 pe-16 ps-9 text-small text-ink transition-colors duration-fast placeholder:text-ink-subtle hover:border-line-strong focus:border-primary [&::-webkit-search-cancel-button]:hidden"
        />

        <span className="absolute end-2 flex items-center gap-1">
          {isPending ? (
            <Loader2 size={14} aria-hidden="true" className="animate-spin text-ink-subtle" />
          ) : query ? (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
              aria-label={t("ui.clear")}
              className="grid size-5 cursor-pointer place-items-center rounded text-ink-subtle hover:text-ink"
            >
              <X size={13} aria-hidden="true" />
            </button>
          ) : variant === "header" ? (
            <kbd className="hidden rounded border border-line px-1.5 py-0.5 text-[10px] font-medium text-ink-subtle lg:block">
              ⌘K
            </kbd>
          ) : null}
        </span>
      </div>

      {showPanel ? (
        <div className="absolute inset-x-0 top-[calc(100%+6px)] z-70 overflow-hidden rounded-lg border border-line bg-surface-2 shadow-e4 animate-slide-up">
          {results.length === 0 ? (
            <p className="px-3 py-4 text-center text-small text-ink-muted">
              {isPending ? t("ui.loading") : t("empty.noSearchResults", { query })}
            </p>
          ) : (
            <ul id={`${id}-listbox`} role="listbox" aria-label={t("nav.search")}>
              {results.map((result, index) => (
                <li
                  key={`${result.kind}-${result.id}`}
                  id={`${id}-option-${index}`}
                  role="option"
                  aria-selected={index === activeIndex}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    go(result);
                  }}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={cn(
                    "flex cursor-pointer items-center gap-2.5 border-b border-line-soft px-3 py-2.5 last:border-b-0",
                    index === activeIndex && "bg-surface-3",
                  )}
                >
                  <span className="grid size-7 shrink-0 place-items-center rounded-md bg-surface text-ink-subtle">
                    <SportIcon name={KIND_ICON[result.kind] as never} size={14} />
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-small font-medium text-ink">
                      {/* Sports carry an i18n key rather than a display name. */}
                      {result.kind === "sport" ? t(result.title) : result.title}
                    </span>
                    {result.subtitleKey || result.subtitle ? (
                      <span className="block truncate text-caption normal-case tracking-normal text-ink-subtle">
                        {result.subtitleKey ? t(result.subtitleKey) : result.subtitle}
                      </span>
                    ) : null}
                  </span>

                  {result.meta ? (
                    <span className="numeric shrink-0 text-caption normal-case tracking-normal text-ink-subtle">
                      {result.meta}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
