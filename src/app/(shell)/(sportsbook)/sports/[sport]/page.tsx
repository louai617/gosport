import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  getCompetitionsWithEvents,
  getCountries,
  getFeaturedEvent,
  getSportByKey,
} from "@/services/sportsService";
import { getT } from "@/i18n/server";
import { isSportKey } from "@/lib/sport";
import { findCountryByParam, sportsbookHref } from "@/lib/sportsbookNav";
import { SportBoard } from "@/components/sports/SportBoard";
import { SportIcon } from "@/components/sports/SportIcon";
import { FeaturedEventCard } from "@/components/matches/FeaturedEventCard";
import { CompetitionCrest } from "@/components/brand/CompetitionCrest";
import { Breadcrumbs } from "@/components/navigation/Breadcrumbs";
import { StatusDot } from "@/components/ui/StatusDot";

interface PageProps {
  params: Promise<{ sport: string }>;
  searchParams: Promise<{ country?: string | string[] }>;
}

/** A repeated `?country=` is a malformed link, not a multi-select — take the first. */
function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const [{ sport }, query] = await Promise.all([params, searchParams]);
  if (!isSportKey(sport)) return {};

  const [t, countries] = await Promise.all([getT(), getCountries()]);
  const country = findCountryByParam(countries, firstValue(query.country));
  const sportName = t(`sports.${sport}`);

  return { title: country ? `${t(country.nameKey)} · ${sportName}` : sportName };
}

export default async function SportPage({ params, searchParams }: PageProps) {
  const [{ sport: sportKey }, query] = await Promise.all([params, searchParams]);
  if (!isSportKey(sportKey)) notFound();

  const [sport, countries] = await Promise.all([getSportByKey(sportKey), getCountries()]);
  if (!sport) notFound();

  // An unknown code narrows nothing: the sport board is a better landing than a 404
  // for a hand-edited or outdated link.
  const country = findCountryByParam(countries, firstValue(query.country));

  const [t, board, featured] = await Promise.all([
    getT(),
    getCompetitionsWithEvents({
      sportId: sport.id,
      countryId: country?.id,
      status: ["scheduled", "live"],
    }),
    country ? null : getFeaturedEvent(sportKey),
  ]);

  // Within one country the rail lists leagues in tier order; the board follows
  // it, so the second division never lands above the top flight it feeds.
  const blocks = country
    ? [...board].sort((a, b) => a.competition.order - b.competition.order)
    : board;

  if (!country) {
    return (
      <div className="space-y-6">
        <header>
          <h1 className="text-h1 text-ink">{t(sport.nameKey)}</h1>
          <p className="mt-1 text-small text-ink-muted">
            {t("sportsbook.eventCount", { count: sport.eventCount })}
            {sport.liveEventCount > 0
              ? ` · ${t("sportsbook.liveCount", { count: sport.liveEventCount })}`
              : ""}
          </p>
        </header>

        {featured ? <FeaturedEventCard event={featured} /> : null}

        <SportBoard blocks={blocks} />
      </div>
    );
  }

  const eventCount = blocks.reduce((sum, block) => sum + block.events.length, 0);
  const liveCount = blocks.reduce(
    (sum, block) => sum + block.events.filter((event) => event.status === "live").length,
    0,
  );

  return (
    <div className="space-y-6">
      <header className="space-y-4">
        <Breadcrumbs
          label={t("sportsbook.nav.breadcrumb")}
          items={[
            {
              label: t(sport.nameKey),
              href: sportsbookHref.sport(sport.key),
              icon: <SportIcon name={sport.icon} size={14} />,
            },
            { label: t(country.nameKey) },
          ]}
        />

        <div className="flex items-center gap-3.5">
          <span
            aria-hidden="true"
            className="grid size-12 shrink-0 place-items-center rounded-lg border border-line bg-surface text-[24px] leading-none"
          >
            {country.flag}
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-h1 text-ink">{t(country.nameKey)}</h1>
            <p className="mt-1 text-small text-ink-muted">
              {t("sportsbook.eventCount", { count: eventCount })}
              {liveCount > 0 ? ` · ${t("sportsbook.liveCount", { count: liveCount })}` : ""}
            </p>
          </div>
        </div>

        {blocks.length > 1 ? (
          <nav aria-label={t("sportsbook.competitions")}>
            <ul className="flex flex-wrap gap-1.5">
              {blocks.map(({ competition, events }) => {
                const live = events.filter((event) => event.status === "live").length;
                return (
                  <li key={competition.id}>
                    <Link
                      href={sportsbookHref.competition(competition.id)}
                      className="inline-flex h-8 items-center gap-2 whitespace-nowrap rounded-full border border-line bg-surface-2 ps-1.5 pe-2.5 text-small font-medium text-ink-muted transition-colors duration-fast hover:border-line-strong hover:text-ink"
                    >
                      <CompetitionCrest
                        name={competition.name}
                        monogram={competition.monogram}
                        hue={competition.hue}
                        size="xs"
                      />
                      {competition.name}
                      {live > 0 ? (
                        <span className="flex items-center gap-1">
                          <StatusDot tone="live" pulse size="xs" />
                          <span className="numeric text-caption font-semibold text-live">{live}</span>
                        </span>
                      ) : (
                        <span className="numeric rounded-full bg-surface-3 px-1.5 text-caption text-ink-subtle">
                          {events.length}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        ) : null}
      </header>

      <SportBoard blocks={blocks} defaultOpenCount={blocks.length} />
    </div>
  );
}
