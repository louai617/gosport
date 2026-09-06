import { Suspense } from "react";
import Link from "next/link";
import { Radio, ShieldCheck } from "lucide-react";
import { getFeaturedPromotions } from "@/services/promotionsService";
import { getGames } from "@/services/gamesService";
import {
  getFeaturedEvent,
  getLiveEvents,
  getPopularCompetitions,
  getUpcomingEvents,
} from "@/services/sportsService";
import { getCountries } from "@/services/sportsService";
import { getT } from "@/i18n/server";
import { Section } from "@/components/layout/Section";
import { FeaturedEventCard } from "@/components/matches/FeaturedEventCard";
import { LiveMatchCard } from "@/components/matches/LiveMatchCard";
import { MatchList } from "@/components/matches/MatchList";
import { CompetitionCard } from "@/components/sports/CompetitionCard";
import { PromotionCard } from "@/components/promotions/PromotionCard";
import { GameCard } from "@/components/games/GameCard";
import { BetSlipPanel } from "@/components/betting/BetSlipPanel";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonCard } from "@/components/ui/Skeleton";
import { StatusDot } from "@/components/ui/StatusDot";

export default async function HomePage() {
  const t = await getT();

  const [featured, live, upcoming, competitions, countries, promotions, games] =
    await Promise.all([
      getFeaturedEvent("football"),
      getLiveEvents({ limit: 6 }),
      getUpcomingEvents({ limit: 12 }),
      getPopularCompetitions(6),
      getCountries(),
      getFeaturedPromotions(3),
      getGames({ status: "playable", limit: 5 }),
    ]);

  const countryOf = (countryId: string) =>
    countries.find((country) => country.id === countryId);

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:gap-7">
        <div className="min-w-0 space-y-8 lg:space-y-10">
          {/* ---------------------------------------------------- hero ---- */}
          <section aria-labelledby="hero-heading">
            <div className="mb-4">
              <h1 id="hero-heading" className="text-h1 text-ink sm:text-display">
                {t("brand.tagline")}
              </h1>
              <p className="mt-1.5 max-w-2xl text-body text-ink-muted">
                {t("home.hero.subtitle")}
              </p>
            </div>

            {featured ? (
              <FeaturedEventCard event={featured} />
            ) : (
              <SkeletonCard />
            )}
          </section>

          {/* ---------------------------------------------------- live ---- */}
          <Section
            title={t("home.live.title")}
            description={t("home.live.description")}
            actionHref="/live"
            actionLabel={t("ui.seeAll")}
            aside={
              live.length > 0 ? (
                <span className="flex items-center gap-1.5 text-small font-semibold text-live">
                  <StatusDot tone="live" pulse />
                  <span className="numeric">{live.length}</span>
                </span>
              ) : undefined
            }
          >
            {live.length === 0 ? (
              <div className="rounded-xl border border-line bg-surface">
                <EmptyState
                  icon={<Radio size={20} aria-hidden="true" />}
                  title={t("empty.noLiveMatches")}
                  description={t("home.live.emptyDescription")}
                />
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                {live.map((event) => (
                  <LiveMatchCard key={event.id} event={event} />
                ))}
              </div>
            )}
          </Section>

          {/* ------------------------------------------------ upcoming ---- */}
          <Section
            title={t("home.upcoming.title")}
            description={t("home.upcoming.description")}
            actionHref="/sports/football"
            actionLabel={t("ui.seeAll")}
          >
            <Suspense fallback={<SkeletonCard />}>
              <MatchList events={upcoming} groupByDay />
            </Suspense>
          </Section>

          {/* ---------------------------------------- popular leagues ---- */}
          <Section
            title={t("home.popular.title")}
            description={t("home.popular.description")}
            actionHref="/sports"
            actionLabel={t("ui.seeAll")}
          >
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {competitions.map((competition) => (
                <CompetitionCard
                  key={competition.id}
                  competition={competition}
                  country={countryOf(competition.countryId)}
                />
              ))}
            </div>
          </Section>

          {/* ---------------------------------------------- promotions ---- */}
          <Section
            title={t("home.promotions.title")}
            description={t("home.promotions.description")}
            actionHref="/promotions"
            actionLabel={t("ui.seeAll")}
          >
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {promotions.map((promotion) => (
                <PromotionCard key={promotion.id} promotion={promotion} />
              ))}
            </div>
          </Section>

          {/* --------------------------------------------------- games ---- */}
          <Section
            title={t("games.title")}
            description={t("games.originals.description")}
            actionHref="/games"
            actionLabel={t("ui.seeAll")}
          >
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {games.map((game) => (
                <GameCard key={game.id} game={game} />
              ))}
            </div>
          </Section>

          {/* --------------------------------- responsible gambling ------- */}
          <section
            aria-labelledby="rg-heading"
            className="rounded-xl border border-line bg-surface p-5 sm:p-6"
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <span
                aria-hidden="true"
                className="grid size-11 shrink-0 place-items-center rounded-lg border border-line-soft bg-surface-2 text-ink-muted"
              >
                <ShieldCheck size={20} />
              </span>

              <div className="min-w-0 flex-1">
                <h2 id="rg-heading" className="text-h3 text-ink">
                  {t("home.responsible.title")}
                </h2>
                <p className="mt-1.5 max-w-3xl text-small leading-relaxed text-ink-muted">
                  {t("home.responsible.body")}
                </p>

                <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
                  {[
                    "responsible.limits.deposit.title",
                    "responsible.limits.session.title",
                    "responsible.cooling.title",
                    "responsible.selfExclusion.title",
                  ].map((key) => (
                    <li
                      key={key}
                      className="flex items-center gap-1.5 text-small text-ink-muted"
                    >
                      <span aria-hidden="true" className="size-1 rounded-full bg-primary" />
                      {t(key)}
                    </li>
                  ))}
                </ul>

                <Link
                  href="/responsible-gambling"
                  className="mt-4 inline-flex text-small font-semibold text-primary transition-colors duration-fast hover:text-primary-hover"
                >
                  {t("home.responsible.cta")}
                </Link>
              </div>
            </div>
          </section>
        </div>

        {/* ------------------------------------------------- bet slip ---- */}
        <div className="hidden xl:block">
          <BetSlipPanel />
        </div>
      </div>
    </div>
  );
}
