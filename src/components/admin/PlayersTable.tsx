"use client";

import Link from "next/link";
import { Lock, ShieldOff } from "lucide-react";
import type { Paginated } from "@/types";
import type { PlayerRow } from "@/services/playerAdminService";
import { formatAmount, formatDate, formatDateTime } from "@/lib/format";
import { useI18n } from "@/i18n/I18nProvider";
import { Badge } from "@/components/ui/Badge";
import { buttonStyles } from "@/components/ui/Button";
import { DataTable, type DataTableColumn } from "./DataTable";
import { PLAYER_STATUS_TONE, KYC_TONE } from "./tones";

export interface PlayersTableProps {
  data: Paginated<PlayerRow>;
  params: {
    search?: string;
    status?: string;
    kycStatus?: string;
    restricted?: string;
    manager?: string;
    from?: string;
    to?: string;
    sort?: string;
    direction?: "asc" | "desc";
  };
  canCreate: boolean;
  /** Superadmin: show which manager each player belongs to, and the verification column/filter. */
  oversight: boolean;
}

/** The player table: search, status/verification/restriction filters, date range, sorting, paging. */
export function PlayersTable({ data, params, canCreate, oversight }: PlayersTableProps) {
  const { t, locale } = useI18n();

  const columns: DataTableColumn<PlayerRow>[] = [
    {
      key: "username",
      header: t("admin.column.player"),
      sortable: true,
      render: (row) => (
        <Link href={`/admin/players/${row.id}`} className="block min-w-0 max-w-64 hover:underline">
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
      sortable: true,
      render: (row) => (
        <span className="flex flex-wrap items-center gap-1.5">
          <Badge tone={PLAYER_STATUS_TONE[row.status]} dot>
            {t(`admin.userStatus.${row.status}`)}
          </Badge>
          {row.wageringBlocked || row.withdrawalsBlocked ? (
            <span title={t("admin.players.restricted")} className="text-warning">
              <ShieldOff size={14} aria-label={t("admin.players.restricted")} />
            </span>
          ) : null}
          {row.status === "locked" ? <Lock size={13} aria-hidden="true" className="text-warning" /> : null}
        </span>
      ),
    },
    ...(oversight
      ? [
          {
            key: "manager",
            header: t("admin.column.manager"),
            secondary: true,
            render: (row: PlayerRow) =>
              row.managerId ? (
                <Link href={`/admin/managers/${row.managerId}`} className="hover:underline">
                  {row.managerUsername}
                </Link>
              ) : (
                "—"
              ),
          },
          {
            key: "kycStatus",
            header: t("admin.column.kyc"),
            secondary: true,
            render: (row: PlayerRow) => (
              <Badge tone={KYC_TONE[row.kycStatus]}>{t(`admin.kyc.${row.kycStatus}`)}</Badge>
            ),
          },
        ]
      : []),
    {
      key: "balance",
      header: t("admin.column.balance"),
      numeric: true,
      align: "end",
      sortable: true,
      render: (row) => formatAmount(row.balance, locale),
    },
    {
      key: "createdAt",
      header: t("admin.column.registered"),
      numeric: true,
      sortable: true,
      secondary: true,
      render: (row) => formatDate(row.createdAt, locale),
    },
    {
      key: "lastLoginAt",
      header: t("admin.column.lastSeen"),
      numeric: true,
      align: "end",
      sortable: true,
      secondary: true,
      render: (row) => (row.lastLoginAt ? formatDateTime(row.lastLoginAt, locale) : "—"),
    },
  ];

  return (
    <DataTable
      basePath="/admin/players"
      columns={columns}
      rowKey={(row) => row.id}
      data={data}
      searchValue={params.search}
      searchPlaceholder={t("admin.players.searchPlaceholder")}
      sort={params.sort}
      direction={params.direction ?? null}
      emptyTitle={t("admin.players.empty")}
      filters={[
        {
          param: "status",
          label: t("admin.column.status"),
          value: params.status,
          options: (["active", "pending", "suspended", "locked", "self_excluded", "closed"] as const).map(
            (value) => ({ value, label: t(`admin.userStatus.${value}`) }),
          ),
        },
        ...(oversight
          ? [
              {
                param: "kycStatus",
                label: t("admin.column.kyc"),
                value: params.kycStatus,
                options: (["not_started", "pending", "verified", "rejected", "expired"] as const).map((value) => ({
                  value,
                  label: t(`admin.kyc.${value}`),
                })),
              },
              {
                param: "restricted",
                label: t("admin.players.restrictions"),
                value: params.restricted,
                options: [{ value: "true", label: t("admin.players.restricted") }],
              },
            ]
          : []),
      ]}
      inputs={[
        { param: "from", label: t("admin.players.registeredFrom"), type: "date", value: params.from },
        { param: "to", label: t("admin.players.registeredTo"), type: "date", value: params.to },
      ]}
      toolbar={
        canCreate ? (
          <Link href="/admin/players/new" className={buttonStyles({ size: "md" })}>
            {t("admin.players.create")}
          </Link>
        ) : undefined
      }
    />
  );
}
