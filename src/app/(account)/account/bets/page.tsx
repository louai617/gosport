import type { Metadata } from "next";
import { getBets } from "@/services/userService";
import { getT } from "@/i18n/server";
import { BetHistoryTable } from "@/components/account/BetHistoryTable";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("account.bets.title") };
}

export default async function BetsPage() {
  const [t, bets] = await Promise.all([getT(), getBets({ pageSize: 100 })]);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-h1 text-ink">{t("account.bets.title")}</h1>
        <p className="mt-1 text-small text-ink-muted">{t("account.bets.description")}</p>
      </header>

      <BetHistoryTable bets={bets} />
    </div>
  );
}
