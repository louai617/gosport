import type { Metadata } from "next";
import { getCompetitionsWithEvents } from "@/services/sportsService";
import { getT } from "@/i18n/server";
import { SportBoard } from "@/components/sports/SportBoard";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("nav.sports") };
}

export default async function SportsPage() {
  const [t, blocks] = await Promise.all([
    getT(),
    getCompetitionsWithEvents({ status: ["scheduled", "live"] }),
  ]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-h1 text-ink">{t("sportsbook.allSports")}</h1>
        <p className="mt-1 text-small text-ink-muted">
          {t("sportsbook.allSportsDescription")}
        </p>
      </header>

      <SportBoard blocks={blocks.slice(0, 25)} />
    </div>
  );
}
