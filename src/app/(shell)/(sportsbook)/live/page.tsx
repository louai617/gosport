import type { Metadata } from "next";
import { Radio } from "lucide-react";
import { getLiveEvents, getSports } from "@/services/sportsService";
import { getT } from "@/i18n/server";
import { LiveBoard } from "@/components/matches/LiveBoard";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("sportsbook.live.title") };
}

export default async function LivePage() {
  const [t, sports, events] = await Promise.all([getT(), getSports(), getLiveEvents({})]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2.5 text-h1 text-ink">
            <Radio size={22} aria-hidden="true" className="text-live" />
            {t("sportsbook.live.title")}
          </h1>
          <p className="mt-1 text-small text-ink-muted">
            {t("sportsbook.live.description")}
          </p>
        </div>
      </header>

      <LiveBoard events={events} sports={sports} />
    </div>
  );
}
