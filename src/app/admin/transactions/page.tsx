import type { Metadata } from "next";
import { Download } from "lucide-react";
import { flattenParams, transactionListQuery } from "@/lib/adminQueries";
import { getAdminT } from "@/i18n/server";
import { requirePageAdmin } from "@/server/auth/pageGuard";
import { can } from "@/server/auth/permissions";
import { getAdminTransactions } from "@/services/adminService";
import { buttonStyles } from "@/components/ui/Button";
import { TransactionsList } from "@/components/wallet/TransactionsList";

export const metadata: Metadata = { title: "Transactions" };

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AdminTransactionsPage({ searchParams }: PageProps) {
  const user = await requirePageAdmin("transactions.read");
  const raw = flattenParams(await searchParams);
  const parsed = transactionListQuery.safeParse(raw);
  const q = parsed.success ? parsed.data : transactionListQuery.parse({});

  const [t, transactions] = await Promise.all([getAdminT(), getAdminTransactions(q)]);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-h1 text-ink">{t("admin.transactions.title")}</h1>
        <p className="mt-1 text-small text-ink-muted">{t("admin.transactions.description")}</p>
      </header>

      <TransactionsList
        basePath="/admin/transactions"
        variant="admin"
        data={transactions}
        params={{
          search: raw.search,
          kind: raw.kind,
          status: raw.status,
          from: raw.from,
          to: raw.to,
          minAmount: raw.minAmount,
          maxAmount: raw.maxAmount,
          sort: raw.sort,
          direction: raw.direction === "asc" ? "asc" : raw.direction === "desc" ? "desc" : undefined,
        }}
        toolbar={
          can(user.role, "reports.export") ? (
            <a
              href={`/api/admin/reports/export?kind=transactions&period=${raw.from && raw.to ? `custom&from=${raw.from}&to=${raw.to}` : "last30"}`}
              className={buttonStyles({ variant: "secondary" })}
            >
              <Download size={14} aria-hidden="true" />
              {t("admin.reports.exportCsv")}
            </a>
          ) : undefined
        }
      />
    </div>
  );
}
