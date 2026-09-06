"use client";

import type { AccountStatus, KycStatus } from "@/types";
import { useT } from "@/i18n/I18nProvider";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { DataTable, type DataTableColumn } from "./DataTable";

export interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  phone: string;
  country: string;
  status: AccountStatus;
  kycStatus: KycStatus;
  createdAt: string;
  lastLoginAt: string;
}

export interface AdminUsersTableProps {
  rows: AdminUserRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  search?: string;
  sort?: string;
  direction?: "asc" | "desc";
  status?: string;
  kycStatus?: string;
}

const STATUS_TONE: Record<AccountStatus, BadgeTone> = {
  active: "success",
  restricted: "warning",
  self_excluded: "danger",
  closed: "neutral",
};

const KYC_TONE: Record<KycStatus, BadgeTone> = {
  verified: "success",
  pending: "info",
  rejected: "danger",
  expired: "warning",
  not_started: "neutral",
};

export function AdminUsersTable({
  rows,
  page,
  pageSize,
  total,
  totalPages,
  search,
  sort,
  direction,
  status,
  kycStatus,
}: AdminUsersTableProps) {
  const t = useT();

  const columns: DataTableColumn<AdminUserRow>[] = [
    {
      key: "name",
      header: t("admin.column.name"),
      sortable: true,
      render: (row) => (
        <span className="block">
          <span className="block truncate font-medium text-ink">{row.name}</span>
          <span className="block truncate text-caption normal-case tracking-normal text-ink-subtle">
            {row.email}
          </span>
        </span>
      ),
    },
    {
      key: "phone",
      header: t("auth.field.phone"),
      numeric: true,
      secondary: true,
      render: (row) => row.phone,
    },
    {
      key: "country",
      header: t("auth.field.country"),
      secondary: true,
      render: (row) => row.country,
    },
    {
      key: "status",
      header: t("admin.column.status"),
      render: (row) => (
        <Badge tone={STATUS_TONE[row.status]} dot>
          {t(`admin.userStatus.${row.status}`)}
        </Badge>
      ),
    },
    {
      key: "kycStatus",
      header: t("admin.column.kyc"),
      render: (row) => (
        <Badge tone={KYC_TONE[row.kycStatus]}>{t(`admin.kyc.${row.kycStatus}`)}</Badge>
      ),
    },
    {
      key: "createdAt",
      header: t("admin.column.registered"),
      numeric: true,
      sortable: true,
      secondary: true,
      render: (row) => row.createdAt,
    },
    {
      key: "lastLoginAt",
      header: t("admin.column.lastSeen"),
      numeric: true,
      align: "end",
      secondary: true,
      render: (row) => row.lastLoginAt,
    },
  ];

  return (
    <DataTable
      basePath="/admin/users"
      columns={columns}
      rowKey={(row) => row.id}
      data={{ items: rows, page, pageSize, total, totalPages }}
      searchValue={search}
      searchPlaceholder={t("admin.users.searchPlaceholder")}
      sort={sort}
      direction={direction ?? null}
      filters={[
        {
          param: "status",
          label: t("admin.column.status"),
          value: status,
          options: (["active", "restricted", "self_excluded", "closed"] as const).map(
            (value) => ({ value, label: t(`admin.userStatus.${value}`) }),
          ),
        },
        {
          param: "kycStatus",
          label: t("admin.column.kyc"),
          value: kycStatus,
          options: (
            ["not_started", "pending", "verified", "rejected", "expired"] as const
          ).map((value) => ({ value, label: t(`admin.kyc.${value}`) })),
        },
      ]}
    />
  );
}
