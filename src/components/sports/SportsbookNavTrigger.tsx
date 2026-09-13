"use client";

import { SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/cn";
import { useT } from "@/i18n/I18nProvider";
import { CompetitionCrest } from "@/components/brand/CompetitionCrest";
import { GameIcon } from "@/components/games/GameIcon";
import { SportIcon } from "./SportIcon";
import type { SportsbookNav } from "./useSportsbookNav";

export interface SportsbookNavTriggerProps {
  model: SportsbookNav;
  expanded: boolean;
  onOpen: () => void;
  className?: string;
}

/**
 * Below `lg` the rail becomes a drawer, and this is its handle.
 *
 * It doubles as the "you are here" line — the sport, country and league the
 * board is filtered to — so a phone user never has to open the drawer just to
 * find out what they are looking at.
 */
export function SportsbookNavTrigger({
  model,
  expanded,
  onOpen,
  className,
}: SportsbookNavTriggerProps) {
  const t = useT();
  const { selection } = model;

  const sport = selection.sportKey
    ? [...model.sportsById.values()].find((entry) => entry.key === selection.sportKey)
    : undefined;
  const country = selection.countryId ? model.countriesById.get(selection.countryId) : undefined;
  const competition = selection.competitionId
    ? model.competitionsById.get(selection.competitionId)
    : undefined;

  const game = selection.gameSlug ? model.gamesBySlug.get(selection.gameSlug) : undefined;

  const trail = [sport ? t(sport.nameKey) : null, country ? t(country.nameKey) : null].filter(
    (part): part is string => part !== null,
  );

  let title: string;
  let caption: string;
  if (game) {
    title = game.nameKey ? t(game.nameKey) : (game.name ?? game.slug);
    caption = `${t("nav.games")} · ${t(`games.category.${game.category}`)}`;
  } else if (selection.scope === "games") {
    title = t("sportsbook.nav.allGames");
    caption = t("nav.games");
  } else if (competition) {
    title = competition.name;
    caption = trail.join(" · ");
  } else if (selection.scope === "country" && country) {
    title = t(country.nameKey);
    caption = sport ? t(sport.nameKey) : t("sportsbook.nav.title");
  } else if (sport) {
    title = t(sport.nameKey);
    caption = t("sportsbook.nav.title");
  } else if (selection.scope === "all") {
    title = t("sportsbook.allSports");
    caption = t("sportsbook.nav.title");
  } else {
    title = t("sportsbook.nav.openBrowser");
    caption = t("sportsbook.nav.title");
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-haspopup="dialog"
      aria-expanded={expanded}
      className={cn(
        "group flex w-full cursor-pointer items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2 text-start transition-colors duration-fast hover:border-line-strong hover:bg-surface-2",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="grid size-9 shrink-0 place-items-center rounded-md border border-line-soft bg-surface-2 text-primary"
      >
        {game ? (
          <GameIcon gameKey={game.key} category={game.category} size={17} />
        ) : selection.scope === "games" ? (
          <GameIcon size={17} />
        ) : competition ? (
          <CompetitionCrest
            name={competition.name}
            monogram={competition.monogram}
            hue={competition.hue}
            size="sm"
          />
        ) : selection.scope === "country" && country ? (
          <span className="text-[17px] leading-none">{country.flag}</span>
        ) : sport ? (
          <SportIcon name={sport.icon} size={18} />
        ) : (
          <SportIcon name="grid" size={16} />
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="sr-only">{t("sportsbook.nav.openBrowser")}: </span>
        <span className="block truncate text-caption normal-case tracking-normal text-ink-subtle">
          {caption}
        </span>
        <span className="block truncate text-small font-semibold text-ink">{title}</span>
      </span>

      <span className="flex shrink-0 items-center gap-1.5 rounded-md border border-line bg-surface-2 px-2.5 py-1.5 text-caption normal-case tracking-normal text-ink-muted transition-colors duration-fast group-hover:border-line-strong group-hover:text-ink">
        <SlidersHorizontal size={13} aria-hidden="true" />
        {t("sportsbook.nav.browse")}
      </span>
    </button>
  );
}
