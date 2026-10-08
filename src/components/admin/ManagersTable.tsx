"use client";

import Link from "next/link";
import type { Paginated } from "@/types";
import type { ManagerRow } from "@/services/managerService";
import { formatAmount, formatDate, formatDateTime, formatNumber } from "@/lib/format";
import { useI18n } from "@/i18n/I18nProvider";
import { Badge } from "@/components/ui/Badge";
import { buttonStyles } from "@/components/ui/Button";
import { DataTable, type DataTableColumn } from "./DataTable";
import { PLAYER_STATUS_TONE } from "./tones";

export function ManagersTable({
  data,
  params,
}: {
  data: Paginated<ManagerRow>;
  params: { search?: string };
}) {
  const { t, locale } = useI18n();

  const columns: DataTableColumn<ManagerRow>[] = [
    {
      key: "username",
      header: t("admin.column.manager"),
      render: (row) => (
        <Link href={`/admin/managers/${row.id}`} className="block min-w-0 max-w-64 hover:underline">
          <span className="block truncate font-medium text-ink">{row.username}</span>
          <span className="block truncate text-caption normal-case tracking-normal text-ink-subtle">
            {row.displayName}
          </span>
        </Link>
      ),
    },
    {
      key: "status",
      header: t("admin.column.status"),
      render: (row) => (
        <Badge tone={PLAYER_STATUS_TONE[row.status]} dot>
          {t(`admin.userStatus.${row.status}`)}
        </Badge>
      ),
    },
    {
      key: "balance",
      header: t("admin.column.balance"),
      numeric: true,
      align: "end",
      render: (row) => formatAmount(row.balance, locale),
    },
    {
      key: "players",
      header: t("admin.column.players"),
      numeric: true,
      align: "end",
      render: (row) => formatNumber(row.playerCount, locale),
    },
    {
      key: "createdAt",
      header: t("admin.column.registered"),
      numeric: true,
      secondary: true,
      render: (row) => formatDate(row.createdAt, locale),
    },
    {
      key: "lastLoginAt",
      header: t("admin.column.lastSeen"),
      numeric: true,
      align: "end",
      secondary: true,
      render: (row) => (row.lastLoginAt ? formatDateTime(row.lastLoginAt, locale) : "—"),
    },
  ];

  return (
    <DataTable
      basePath="/admin/managers"
      columns={columns}
      rowKey={(row) => row.id}
      data={data}
      searchValue={params.search}
      searchPlaceholder={t("admin.managers.searchPlaceholder")}
      emptyTitle={t("admin.managers.empty")}
      toolbar={
        <Link href="/admin/managers/new" className={buttonStyles({ size: "md" })}>
          {t("admin.managers.create")}
        </Link>
      }
    />
  );
}
