"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Search, SlidersHorizontal } from "lucide-react";
import type { Paginated } from "@/types";
import { cn } from "@/lib/cn";
import { useT } from "@/i18n/I18nProvider";
import { Input } from "@/components/ui/Input";
import { Pagination } from "@/components/ui/Pagination";
import { Select } from "@/components/ui/Select";
import {
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
  TableEmpty,
  type SortDirection,
} from "@/components/ui/Table";

export interface DataTableColumn<Row> {
  /** Matches the `sort` query value when the column is sortable. */
  key: string;
  header: string;
  render: (row: Row) => ReactNode;
  align?: "start" | "center" | "end";
  numeric?: boolean;
  sortable?: boolean;
  /** Hidden below `md`, for columns that are useful but not essential. */
  secondary?: boolean;
}

export interface DataTableFilter {
  /** Query-string parameter this filter writes to. */
  param: string;
  label: string;
  options: Array<{ value: string; label: string }>;
  value?: string;
}

/** A free-form filter: a date, a number or a short text, written to the URL on commit. */
export interface DataTableInput {
  param: string;
  label: string;
  type: "date" | "number" | "text";
  value?: string;
  placeholder?: string;
}

export interface DataTableProps<Row> {
  /** Base path the table pushes query changes to, e.g. `/admin/users`. */
  basePath: string;
  columns: DataTableColumn<Row>[];
  data: Paginated<Row>;
  rowKey: (row: Row) => string;
  filters?: DataTableFilter[];
  inputs?: DataTableInput[];
  /** Right-aligned slot in the filter bar, e.g. an export button. */
  toolbar?: ReactNode;
  searchPlaceholder?: string;
  searchValue?: string;
  sort?: string;
  direction?: SortDirection;
  emptyTitle?: string;
  onRowClick?: (row: Row) => void;
}

/**
 * The operator table.
 *
 * Every control writes to the URL rather than to component state: an operator
 * investigating something needs to be able to send a colleague the exact view
 * they are looking at, and the back button has to behave.
 */
export function DataTable<Row>({
  basePath,
  columns,
  data,
  rowKey,
  filters = [],
  inputs = [],
  toolbar,
  searchPlaceholder,
  searchValue = "",
  sort,
  direction = null,
  emptyTitle,
  onRowClick,
}: DataTableProps<Row>) {
  const t = useT();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchValue);

  const push = (mutate: (params: URLSearchParams) => void) => {
    const params = new URLSearchParams(searchParams.toString());
    mutate(params);
    router.push(`${basePath}?${params.toString()}`);
  };

  const setParam = (key: string, value: string) =>
    push((params) => {
      if (value) params.set(key, value);
      else params.delete(key);
      // Any narrowing invalidates the current page.
      if (key !== "page") params.delete("page");
    });

  const toggleSort = (key: string) =>
    push((params) => {
      const nextDirection =
        sort === key && direction === "asc" ? "desc" : "asc";
      params.set("sort", key);
      params.set("direction", nextDirection);
      params.delete("page");
    });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setParam("search", query.trim());
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

        {filters.map((filter) => (
          <div key={filter.param} className="min-w-40">
            <Select
              label={filter.label}
              value={filter.value ?? ""}
              onChange={(event) => setParam(filter.param, event.target.value)}
              options={[{ value: "", label: t("admin.filter.all") }, ...filter.options]}
            />
          </div>
        ))}

        {inputs.map((input) => (
          <div key={`${input.param}:${input.value ?? ""}`} className={input.type === "date" ? "w-40" : "w-32"}>
            <Input
              label={input.label}
              type={input.type}
              inputMode={input.type === "number" ? "decimal" : undefined}
              defaultValue={input.value ?? ""}
              placeholder={input.placeholder}
              // Dates commit as soon as one is picked; numbers and text wait for
              // blur or Enter so typing "1500" does not fire four navigations.
              onChange={input.type === "date" ? (event) => setParam(input.param, event.target.value) : undefined}
              onBlur={
                input.type !== "date"
                  ? (event) => {
                      const next = event.target.value.trim();
                      if (next !== (input.value ?? "")) setParam(input.param, next);
                    }
                  : undefined
              }
              onKeyDown={
                input.type !== "date"
                  ? (event) => {
                      if (event.key === "Enter") setParam(input.param, event.currentTarget.value.trim());
                    }
                  : undefined
              }
            />
          </div>
        ))}

        {toolbar ? <div className="ms-auto flex items-end gap-2">{toolbar}</div> : null}

        {filters.length > 0 || inputs.length > 0 || searchValue ? (
          <button
            type="button"
            onClick={() => router.push(basePath)}
            className="flex h-[38px] cursor-pointer items-center gap-1.5 rounded-md border border-line px-3 text-small text-ink-muted transition-colors duration-fast hover:border-line-strong hover:text-ink"
          >
            <SlidersHorizontal size={14} aria-hidden="true" />
            {t("ui.reset")}
          </button>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-xl border border-line bg-surface">
        <Table>
          <THead>
            <tr>
              {columns.map((column) => (
                <TH
                  key={column.key}
                  align={column.align}
                  sortable={column.sortable}
                  sortDirection={sort === column.key ? direction : null}
                  onSort={column.sortable ? () => toggleSort(column.key) : undefined}
                  className={cn(column.secondary && "hidden md:table-cell")}
                >
                  {column.header}
                </TH>
              ))}
            </tr>
          </THead>

          <TBody>
            {data.items.length === 0 ? (
              <TableEmpty
                colSpan={columns.length}
                title={emptyTitle ?? t("empty.noResults")}
                description={t("empty.tryDifferentFilter")}
              />
            ) : (
              data.items.map((row) => (
                <TR
                  key={rowKey(row)}
                  interactive={Boolean(onRowClick)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {columns.map((column) => (
                    <TD
                      key={column.key}
                      align={column.align}
                      numeric={column.numeric}
                      className={cn(column.secondary && "hidden md:table-cell")}
                    >
                      {column.render(row)}
                    </TD>
                  ))}
                </TR>
              ))
            )}
          </TBody>
        </Table>

        <Pagination
          page={data.page}
          pageSize={data.pageSize}
          total={data.total}
          onPageChange={(page) => setParam("page", String(page))}
          onPageSizeChange={(size) => setParam("pageSize", String(size))}
        />
      </div>
    </div>
  );
}
