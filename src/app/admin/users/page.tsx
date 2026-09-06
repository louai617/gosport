import type { Metadata } from "next";
import type { AccountStatus, KycStatus } from "@/types";
import { getAdminUsers } from "@/services/adminService";
import { getAdminT, getRequestLocale } from "@/i18n/server";
import { formatDate, formatPhone } from "@/lib/format";
import { AdminUsersTable } from "@/components/admin/AdminUsersTable";
import { parseListQuery } from "@/lib/listQuery";

export const metadata: Metadata = { title: "Users" };

interface PageProps {
  searchParams: Promise<Record<string, string | undefined>>;
}

export default async function AdminUsersPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const list = parseListQuery(params);

  const [t, locale, users] = await Promise.all([
    getAdminT(),
    getRequestLocale(),
    getAdminUsers({
      ...list,
      status: params.status as AccountStatus | undefined,
      kycStatus: params.kycStatus as KycStatus | undefined,
    }),
  ]);

  // Formatting happens on the server so the client table stays a dumb renderer
  // and no date/locale logic is duplicated per column.
  const rows = users.items.map((user) => ({
    id: user.id,
    name: `${user.firstName} ${user.lastName}`,
    email: user.email,
    phone: formatPhone(user.phone),
    country: t(`countries.${user.countryCode}`),
    status: user.status,
    kycStatus: user.kycStatus,
    createdAt: formatDate(user.createdAt, locale),
    lastLoginAt: user.lastLoginAt ? formatDate(user.lastLoginAt, locale) : "—",
  }));

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-h1 text-ink">{t("admin.users.title")}</h1>
        <p className="mt-1 text-small text-ink-muted">{t("admin.users.description")}</p>
      </header>

      <AdminUsersTable
        rows={rows}
        page={users.page}
        pageSize={users.pageSize}
        total={users.total}
        totalPages={users.totalPages}
        search={list.search}
        sort={list.sort}
        direction={list.direction}
        status={params.status}
        kycStatus={params.kycStatus}
      />
    </div>
  );
}
