"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { DataTable, type DataTableColumn, type DataTableFilter } from "./DataTable";

/**
 * A row already flattened to display strings on the server.
 *
 * Admin tables all share one shape: cells are text, plus an optional badge.
 * Formatting money and dates server-side keeps every table's locale handling
 * in one place and keeps this component free of domain knowledge.
 */
export interface AdminCell {
  text: string;
  /** Makes the cell a link — to a player, a transaction. */
  href?: string;
  sub?: string;
  badge?: { label: string; tone: BadgeTone; dot?: boolean };
}

export interface AdminRow {
  id: string;
  cells: Record<string, AdminCell>;
}

export interface AdminColumnSpec {
  key: string;
  header: string;
  align?: "start" | "center" | "end";
  numeric?: boolean;
  sortable?: boolean;
  secondary?: boolean;
}

export interface AdminTableClientProps {
  basePath: string;
  columns: AdminColumnSpec[];
  rows: AdminRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  search?: string;
  searchPlaceholder?: string;
  sort?: string;
  direction?: "asc" | "desc";
  filters?: DataTableFilter[];
  emptyTitle?: string;
}

function renderCell(cell: AdminCell | undefined): ReactNode {
  if (!cell) return "—";

  return (
    <span className="block">
      {cell.badge ? (
        <Badge tone={cell.badge.tone} dot={cell.badge.dot}>
          {cell.badge.label}
        </Badge>
      ) : (
        <span className="block truncate">
          {cell.href ? (
            <Link href={cell.href} className="font-medium text-primary underline-offset-2 hover:underline">
              {cell.text}
            </Link>
          ) : (
            cell.text
          )}
        </span>
      )}
      {cell.sub ? (
        <span className="block truncate text-caption normal-case tracking-normal text-ink-subtle">
          {cell.sub}
        </span>
      ) : null}
    </span>
  );
}

export function AdminTableClient({
  basePath,
  columns,
  rows,
  page,
  pageSize,
  total,
  totalPages,
  search,
  searchPlaceholder,
  sort,
  direction,
  filters,
  emptyTitle,
}: AdminTableClientProps) {
  const tableColumns: DataTableColumn<AdminRow>[] = columns.map((column) => ({
    ...column,
    render: (row) => renderCell(row.cells[column.key]),
  }));

  return (
    <DataTable
      basePath={basePath}
      columns={tableColumns}
      rowKey={(row) => row.id}
      data={{ items: rows, page, pageSize, total, totalPages }}
      searchValue={search}
      searchPlaceholder={searchPlaceholder}
      sort={sort}
      direction={direction ?? null}
      filters={filters}
      emptyTitle={emptyTitle}
    />
  );
}
