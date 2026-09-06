"use client";

import type { ComponentPropsWithRef, ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/cn";
import { EmptyState } from "./EmptyState";
import { Skeleton } from "./Skeleton";

export type SortDirection = "asc" | "desc" | null;

export interface TableProps extends ComponentPropsWithRef<"table"> {
  stickyHeader?: boolean;
  /** Class for the scroll container, not the table itself. */
  wrapperClassName?: string;
}

export function Table({
  stickyHeader = false,
  wrapperClassName,
  className,
  children,
  ...props
}: TableProps) {
  return (
    <div
      className={cn(
        "scroll-slim w-full overflow-x-auto",
        stickyHeader && "max-h-[70dvh] overflow-y-auto",
        wrapperClassName,
      )}
    >
      <table
        className={cn("w-full border-collapse text-start text-small", className)}
        {...props}
      >
        {children}
      </table>
    </div>
  );
}

export interface THeadProps extends ComponentPropsWithRef<"thead"> {
  sticky?: boolean;
}

export function THead({ sticky = false, className, ...props }: THeadProps) {
  return (
    <thead
      className={cn(
        "border-b border-line bg-surface-2/60",
        sticky && "sticky top-0 z-10 backdrop-blur",
        className,
      )}
      {...props}
    />
  );
}

export function TBody({ className, ...props }: ComponentPropsWithRef<"tbody">) {
  return <tbody className={cn("divide-y divide-line-soft", className)} {...props} />;
}

export interface TRProps extends ComponentPropsWithRef<"tr"> {
  interactive?: boolean;
}

export function TR({ interactive = false, className, ...props }: TRProps) {
  return (
    <tr
      className={cn(
        "transition-colors duration-fast",
        interactive && "cursor-pointer hover:bg-surface-2/70",
        className,
      )}
      {...props}
    />
  );
}

// `align` is redefined as a logical prop, so the physical HTML attribute of
// the same name is dropped rather than shadowed.
export interface THProps
  extends Omit<ComponentPropsWithRef<"th">, "onClick" | "align"> {
  sortable?: boolean;
  sortDirection?: SortDirection;
  onSort?: () => void;
  align?: "start" | "center" | "end";
}

const ALIGN = {
  start: "text-start",
  center: "text-center",
  end: "text-end",
} as const;

export function TH({
  sortable = false,
  sortDirection = null,
  onSort,
  align = "start",
  className,
  children,
  ...props
}: THProps) {
  const ariaSort =
    sortDirection === "asc"
      ? "ascending"
      : sortDirection === "desc"
        ? "descending"
        : sortable
          ? "none"
          : undefined;

  return (
    <th
      scope="col"
      aria-sort={ariaSort}
      className={cn(
        "px-3 py-2.5 text-caption font-semibold uppercase text-ink-subtle",
        ALIGN[align],
        className,
      )}
      {...props}
    >
      {sortable ? (
        <button
          type="button"
          onClick={onSort}
          className={cn(
            "-mx-1 inline-flex items-center gap-1 rounded-sm px-1 py-0.5 transition-colors duration-fast hover:text-ink",
            align === "end" && "flex-row-reverse",
          )}
        >
          {children}
          <span aria-hidden="true" className="text-ink-subtle">
            {sortDirection === "asc" ? (
              <ArrowUp size={12} />
            ) : sortDirection === "desc" ? (
              <ArrowDown size={12} />
            ) : (
              <ChevronsUpDown size={12} className="opacity-60" />
            )}
          </span>
        </button>
      ) : (
        children
      )}
    </th>
  );
}

export interface TDProps extends Omit<ComponentPropsWithRef<"td">, "align"> {
  align?: "start" | "center" | "end";
  numeric?: boolean;
}

export function TD({ align = "start", numeric = false, className, ...props }: TDProps) {
  return (
    <td
      className={cn(
        "px-3 py-3 align-middle text-ink",
        ALIGN[align],
        numeric && "numeric tabular-nums",
        className,
      )}
      {...props}
    />
  );
}

export interface TableEmptyProps {
  colSpan: number;
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function TableEmpty({ colSpan, ...empty }: TableEmptyProps) {
  return (
    <tr>
      <td colSpan={colSpan} className="p-0">
        <EmptyState size="sm" {...empty} />
      </td>
    </tr>
  );
}

export interface TableSkeletonProps {
  rows?: number;
  columns: number;
}

export function TableSkeleton({ rows = 6, columns }: TableSkeletonProps) {
  return (
    <>
      {Array.from({ length: rows }, (_, rowIndex) => (
        <tr key={rowIndex} className="border-t border-line-soft">
          {Array.from({ length: columns }, (_, colIndex) => (
            <td key={colIndex} className="px-3 py-3.5">
              <Skeleton
                rounded="sm"
                className={cn("h-3", colIndex === 0 ? "w-3/4" : "w-1/2")}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
