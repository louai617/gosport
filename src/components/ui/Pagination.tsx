"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { useT } from "@/i18n/I18nProvider";
import { IconButton } from "./IconButton";

export interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: number[];
  className?: string;
}

/** Windowed page list with ellipses: 1 … 4 5 6 … 20 */
function pageWindow(page: number, totalPages: number): Array<number | "gap"> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const items: Array<number | "gap"> = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(totalPages - 1, page + 1);

  if (start > 2) items.push("gap");
  for (let i = start; i <= end; i += 1) items.push(i);
  if (end < totalPages - 1) items.push("gap");

  items.push(totalPages);
  return items;
}

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50],
  className,
}: PaginationProps) {
  const t = useT();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <nav
      aria-label={t("ui.page")}
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 border-t border-line-soft px-3 py-2.5",
        className,
      )}
    >
      <p className="numeric text-small text-ink-muted">
        {t("ui.of", { from, to, total })}
      </p>

      <div className="flex items-center gap-3">
        {onPageSizeChange ? (
          <label className="flex items-center gap-2 text-small text-ink-muted">
            <span className="hidden sm:inline">{t("ui.rowsPerPage")}</span>
            <select
              value={pageSize}
              onChange={(event) => onPageSizeChange(Number(event.target.value))}
              className="h-8 rounded-md border border-line bg-surface-2 px-2 text-small text-ink transition-colors duration-fast hover:border-line-strong"
            >
              {pageSizeOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <div className="flex items-center gap-1">
          <IconButton
            label={t("ui.previous")}
            size="sm"
            variant="ghost"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            icon={<ChevronLeft size={16} className="flip-rtl" />}
          />

          <ul className="flex items-center gap-1">
            {pageWindow(page, totalPages).map((item, index) =>
              item === "gap" ? (
                <li
                  key={`gap-${index}`}
                  aria-hidden="true"
                  className="px-1 text-small text-ink-subtle"
                >
                  …
                </li>
              ) : (
                <li key={item}>
                  <button
                    type="button"
                    onClick={() => onPageChange(item)}
                    aria-current={item === page ? "page" : undefined}
                    className={cn(
                      "numeric grid h-8 min-w-8 place-items-center rounded-md px-2 text-small transition-colors duration-fast",
                      item === page
                        ? "bg-primary-soft font-semibold text-primary"
                        : "text-ink-muted hover:bg-surface-2 hover:text-ink",
                    )}
                  >
                    {item}
                  </button>
                </li>
              ),
            )}
          </ul>

          <IconButton
            label={t("ui.next")}
            size="sm"
            variant="ghost"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            icon={<ChevronRight size={16} className="flip-rtl" />}
          />
        </div>
      </div>
    </nav>
  );
}
