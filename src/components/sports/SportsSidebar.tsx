"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Star, Trophy } from "lucide-react";
import type { Competition, Country, Favorite, Sport } from "@/types";
import { cn } from "@/lib/cn";
import { useT } from "@/i18n/I18nProvider";
import { CompetitionCrest } from "@/components/brand/CompetitionCrest";
import { SportIcon } from "@/components/sports/SportIcon";
import { StatusDot } from "@/components/ui/StatusDot";

export interface SportsSidebarProps {
  sports: Sport[];
  competitions: Competition[];
  countries: Country[];
  favorites: Favorite[];
  activeSportKey?: string;
  className?: string;
}

/**
 * The left rail of the sportsbook: sports, competitions, countries, favourites.
 *
 * Rendered as four labelled `nav` regions rather than one long list, so screen
 * reader users can jump between them instead of walking forty links.
 */
export function SportsSidebar({
  sports,
  competitions,
  countries,
  favorites,
  activeSportKey,
  className,
}: SportsSidebarProps) {
  const t = useT();
  const pathname = usePathname();

  const favoriteCompetitionIds = new Set(
    favorites.filter((item) => item.kind === "competition").map((item) => item.targetId),
  );

  const favoriteCompetitions = competitions.filter((competition) =>
    favoriteCompetitionIds.has(competition.id),
  );

  const countriesWithEvents = countries
    .map((country) => ({
      country,
      count: competitions
        .filter((competition) => competition.countryId === country.id)
        .reduce((sum, competition) => sum + competition.eventCount, 0),
    }))
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count);

  return (
    <div className={cn("space-y-6", className)}>
      <SidebarSection title={t("nav.sports")}>
        <ul className="space-y-0.5">
          {sports.map((sport) => {
            const active = sport.key === activeSportKey;
            return (
              <li key={sport.id}>
                <Link
                  href={`/sports/${sport.key}`}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-small transition-colors duration-fast",
                    active
                      ? "bg-primary-soft font-semibold text-primary"
                      : "text-ink-muted hover:bg-surface-2 hover:text-ink",
                  )}
                >
                  <SportIcon
                    name={sport.icon}
                    size={16}
                    className={active ? "" : "text-ink-subtle"}
                  />
                  <span className="min-w-0 flex-1 truncate">{t(sport.nameKey)}</span>
                  <Count live={sport.liveEventCount} total={sport.eventCount} />
                </Link>
              </li>
            );
          })}
        </ul>
      </SidebarSection>

      {favoriteCompetitions.length > 0 ? (
        <SidebarSection title={t("sportsbook.favorites")} icon={<Star size={13} />}>
          <ul className="space-y-0.5">
            {favoriteCompetitions.map((competition) => (
              <li key={competition.id}>
                <CompetitionLink competition={competition} pathname={pathname} />
              </li>
            ))}
          </ul>
        </SidebarSection>
      ) : null}

      <SidebarSection title={t("sportsbook.competitions")} icon={<Trophy size={13} />}>
        <ul className="space-y-0.5">
          {competitions.slice(0, 12).map((competition) => (
            <li key={competition.id}>
              <CompetitionLink competition={competition} pathname={pathname} />
            </li>
          ))}
        </ul>
      </SidebarSection>

      <SidebarSection title={t("sportsbook.countries")}>
        <ul className="space-y-0.5">
          {countriesWithEvents.slice(0, 10).map(({ country, count }) => (
            <li key={country.id}>
              <Link
                href={`/sports?country=${country.code}`}
                className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-small text-ink-muted transition-colors duration-fast hover:bg-surface-2 hover:text-ink"
              >
                <span aria-hidden="true" className="text-[15px] leading-none">
                  {country.flag}
                </span>
                <span className="min-w-0 flex-1 truncate">{t(country.nameKey)}</span>
                <span className="numeric text-caption text-ink-subtle">{count}</span>
              </Link>
            </li>
          ))}
        </ul>
      </SidebarSection>
    </div>
  );
}

function CompetitionLink({
  competition,
  pathname,
}: {
  competition: Competition;
  pathname: string;
}) {
  const href = `/competition/${competition.id}`;
  const active = pathname === href;

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-small transition-colors duration-fast",
        active
          ? "bg-primary-soft font-semibold text-primary"
          : "text-ink-muted hover:bg-surface-2 hover:text-ink",
      )}
    >
      <CompetitionCrest
        name={competition.name}
        monogram={competition.monogram}
        hue={competition.hue}
        size="xs"
      />
      <span className="min-w-0 flex-1 truncate">{competition.shortName}</span>
      <Count live={competition.liveEventCount} total={competition.eventCount} />
    </Link>
  );
}

function Count({ live, total }: { live: number; total: number }) {
  if (live > 0) {
    return (
      <span className="flex shrink-0 items-center gap-1">
        <StatusDot tone="live" pulse size="xs" />
        <span className="numeric text-caption font-semibold text-live">{live}</span>
      </span>
    );
  }
  if (total === 0) return null;
  return <span className="numeric shrink-0 text-caption text-ink-subtle">{total}</span>;
}

function SidebarSection({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <nav aria-label={title}>
      <h2 className="mb-1.5 flex items-center gap-1.5 px-2.5 text-caption uppercase text-ink-subtle">
        {icon ? (
          <span aria-hidden="true" className="text-ink-subtle">
            {icon}
          </span>
        ) : null}
        {title}
      </h2>
      {children}
    </nav>
  );
}
