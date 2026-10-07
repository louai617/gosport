"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Search, SlidersHorizontal } from "lucide-react";
import { useT } from "@/i18n/I18nProvider";
import { Input } from "@/components/ui/Input";
import { Pagination } from "@/components/ui/Pagination";
import { Select } from "@/components/ui/Select";

export interface AdminFiltersProps {
  basePath: string;
  searchPlaceholder?: string;
  /** Current URL values, as parsed on the server. */
  values: Record<string, string | undefined>;
  selects?: Array<{
    param: string;
    label: string;
    options: Array<{ value: string; label: string }>;
  }>;
  texts?: Array<{ param: string; label: string; placeholder?: string }>;
  dates?: boolean;
  search?: boolean;
}

/**
 * Filter bar for list pages that render their own table. Every control writes to
 * the URL (the server re-reads and re-validates it), so a filtered view can be
 * shared and the back button works.
 */
export function AdminFilters({
  basePath,
  searchPlaceholder,
  values,
  selects = [],
  texts = [],
  dates = false,
  search = true,
}: AdminFiltersProps) {
  const t = useT();
  const router = useRouter();
  const params = useSearchParams();
  const [query, setQuery] = useState(values.search ?? "");

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    router.push(`${basePath}?${next.toString()}`);
  };

  return (
    <div className="flex flex-wrap items-end gap-3">
      {search ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            set("search", query.trim());
          }}
          className="min-w-56 flex-1"
        >
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            iconStart={<Search size={15} />}
            placeholder={searchPlaceholder ?? t("ui.searchPlaceholder")}
            aria-label={t("ui.search")}
            inputSize="sm"
          />
        </form>
      ) : null}

      {selects.map((select) => (
        <div key={select.param} className="min-w-40">
          <Select
            label={select.label}
            value={values[select.param] ?? ""}
            onChange={(event) => set(select.param, event.target.value)}
            options={[{ value: "", label: t("admin.filter.all") }, ...select.options]}
          />
        </div>
      ))}

      {texts.map((text) => (
        <div key={`${text.param}:${values[text.param] ?? ""}`} className="w-40">
          <Input
            label={text.label}
            placeholder={text.placeholder}
            defaultValue={values[text.param] ?? ""}
            onBlur={(event) => {
              const next = event.target.value.trim();
              if (next !== (values[text.param] ?? "")) set(text.param, next);
            }}
            onKeyDown={(event) => event.key === "Enter" && set(text.param, event.currentTarget.value.trim())}
          />
        </div>
      ))}

      {dates
        ? (["from", "to"] as const).map((key) => (
            <div key={`${key}:${values[key] ?? ""}`} className="w-40">
              <Input
                label={t(`admin.filter.${key}`)}
                type="date"
                defaultValue={values[key] ?? ""}
                onChange={(event) => set(key, event.target.value)}
              />
            </div>
          ))
        : null}

      <button
        type="button"
        onClick={() => router.push(basePath)}
        className="flex h-[38px] cursor-pointer items-center gap-1.5 rounded-md border border-line px-3 text-small text-ink-muted transition-colors duration-fast hover:border-line-strong hover:text-ink"
      >
        <SlidersHorizontal size={14} aria-hidden="true" />
        {t("ui.reset")}
      </button>
    </div>
  );
}

/** Pagination that writes `page` / `pageSize` to the URL. */
export function UrlPagination({
  basePath,
  page,
  pageSize,
  total,
}: {
  basePath: string;
  page: number;
  pageSize: number;
  total: number;
}) {
  const router = useRouter();
  const params = useSearchParams();

  const go = (key: string, value: number) => {
    const next = new URLSearchParams(params.toString());
    next.set(key, String(value));
    if (key === "pageSize") next.delete("page");
    router.push(`${basePath}?${next.toString()}`);
  };

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      <Pagination
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={(value) => go("page", value)}
        onPageSizeChange={(value) => go("pageSize", value)}
      />
    </div>
  );
}
