import type { Metadata } from "next";
import { getTransactions } from "@/services/paymentService";
import { getT } from "@/i18n/server";
import { flattenParams, transactionListQuery } from "@/lib/adminQueries";
import { TransactionsList } from "@/components/wallet/TransactionsList";
import { SimulatedBadge } from "@/components/ui/SimulatedBadge";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("account.transactions.title") };
}

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function TransactionsPage({ searchParams }: PageProps) {
  const raw = flattenParams(await searchParams);
  // `userId` is a platform-wide filter; for a player it is dropped on the floor —
  // the service pins the query to the session user regardless.
  const parsed = transactionListQuery.safeParse(raw);
  const q = parsed.success ? parsed.data : transactionListQuery.parse({});

  const [t, transactions] = await Promise.all([
    getT(),
    getTransactions({
      search: q.search,
      kind: q.kind,
      status: q.status,
      fromIso: q.from?.toISOString(),
      toIso: q.to?.toISOString(),
      minAmount: q.minAmount,
      maxAmount: q.maxAmount,
      sort: q.sort,
      direction: q.direction,
      page: q.page,
      pageSize: q.pageSize,
    }),
  ]);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-h1 text-ink">{t("account.transactions.title")}</h1>
          <p className="mt-1 text-small text-ink-muted">{t("account.transactions.description")}</p>
        </div>
        <SimulatedBadge variant="block" />
      </header>

      <TransactionsList
        basePath="/account/transactions"
        variant="player"
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
      />
    </div>
  );
}
