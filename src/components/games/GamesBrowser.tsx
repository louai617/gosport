"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import type { CasinoGame, GameCategory } from "@/types/games";
import { cn } from "@/lib/cn";
import { useI18n } from "@/i18n/I18nProvider";
import { Button } from "@/components/ui/Button";
import { GameCard } from "./GameCard";

type SortKey = "plays" | "name" | "rtp";
type Availability = "all" | "playable";

export interface GamesBrowserProps {
  /** The whole catalogue, already ordered most played first. */
  games: CasinoGame[];
  /** Rounds played per in-house game key. */
  plays: Record<string, number>;
  categories: GameCategory[];
  initialCategory?: GameCategory | "all";
}

const chip = (active: boolean) =>
  cn(
    "inline-flex h-9 cursor-pointer items-center gap-2 whitespace-nowrap rounded-full border px-3.5 text-small transition-colors duration-fast",
    active
      ? "border-primary/50 bg-primary-soft font-semibold text-primary"
      : "border-line bg-surface text-ink-muted hover:border-line-strong hover:text-ink",
  );

/**
 * The games lobby: one filter bar on top, every game beneath it in a single
 * grid. The default order is most played first — the count comes from the
 * ledger's round records, so a game climbs because people play it. Filtering is
 * a view over the same list; nothing here decides what can be opened.
 */
export function GamesBrowser({ games, plays, categories, initialCategory = "all" }: GamesBrowserProps) {
  const { t } = useI18n();
  const [category, setCategory] = useState<GameCategory | "all">(initialCategory);
  const [availability, setAvailability] = useState<Availability>("all");
  const [sort, setSort] = useState<SortKey>("plays");
  const [query, setQuery] = useState("");

  const title = (game: CasinoGame) => (game.nameKey ? t(game.nameKey) : (game.name ?? game.slug));
  const playsOf = (game: CasinoGame) => (game.key ? (plays[game.key] ?? 0) : 0);

  const counts = useMemo(() => {
    const byCategory = new Map<GameCategory, number>();
    for (const game of games) byCategory.set(game.category, (byCategory.get(game.category) ?? 0) + 1);
    return byCategory;
  }, [games]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = games.filter((game) => {
      if (category !== "all" && game.category !== category) return false;
      if (availability === "playable" && game.status !== "playable") return false;
      if (needle && !title(game).toLowerCase().includes(needle)) return false;
      return true;
    });

    if (sort === "name") return [...filtered].sort((a, b) => title(a).localeCompare(title(b)));
    if (sort === "rtp") return [...filtered].sort((a, b) => (b.rtp ?? -1) - (a.rtp ?? -1));
    // "plays": the incoming order is already most played first.
    return filtered;
    // `title` closes over `t`, which changes only with the locale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [games, category, availability, sort, query, t]);

  const filtering = category !== "all" || availability !== "all" || query.trim() !== "";
  const reset = () => {
    setCategory("all");
    setAvailability("all");
    setQuery("");
  };

  return (
    <div>
      {/* ------------------------------------------------------ filter bar -- */}
      <div className="sticky top-[var(--spacing-header)] z-20 -mx-1 space-y-3 border-b border-line bg-canvas/90 px-1 py-3 backdrop-blur">
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-0 flex-1 basis-56">
            <span className="sr-only">{t("games.filter.search")}</span>
            <Search
              size={15}
              aria-hidden="true"
              className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-ink-subtle"
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("games.filter.search")}
              className="h-10 w-full rounded-md border border-line bg-surface ps-9 pe-3 text-small text-ink placeholder:text-ink-subtle transition-colors duration-fast hover:border-line-strong focus:border-primary"
            />
          </label>

          <div className="flex items-center gap-1.5" role="group" aria-label={t("games.filter.availability")}>
            {(["all", "playable"] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={availability === value}
                onClick={() => setAvailability(value)}
                className={chip(availability === value)}
              >
                {t(value === "all" ? "games.filter.allGames" : "games.filter.playable")}
              </button>
            ))}
          </div>

          <label className="flex items-center gap-2 text-small text-ink-muted">
            <span className="hidden sm:inline">{t("games.filter.sort")}</span>
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as SortKey)}
              className="h-10 cursor-pointer rounded-md border border-line bg-surface px-2.5 text-small text-ink transition-colors duration-fast hover:border-line-strong focus:border-primary"
            >
              <option value="plays">{t("games.sort.plays")}</option>
              <option value="name">{t("games.sort.name")}</option>
              <option value="rtp">{t("games.sort.rtp")}</option>
            </select>
          </label>
        </div>

        <div className="scroll-slim -mb-1 flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label={t("games.filter.category")}>
          <button
            type="button"
            aria-pressed={category === "all"}
            onClick={() => setCategory("all")}
            className={chip(category === "all")}
          >
            {t("games.filter.all")}
            <span className="numeric text-caption text-ink-subtle">{games.length}</span>
          </button>
          {categories
            .filter((value) => (counts.get(value) ?? 0) > 0)
            .map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={category === value}
                onClick={() => setCategory(value)}
                className={chip(category === value)}
              >
                {t(`games.category.${value}`)}
                <span className="numeric text-caption text-ink-subtle">{counts.get(value)}</span>
              </button>
            ))}
        </div>
      </div>

      {/* ----------------------------------------------------------- grid -- */}
      <div className="mt-4 flex items-center justify-between gap-3">
        <p aria-live="polite" className="text-small text-ink-muted">
          {t("games.filter.results", { count: visible.length })}
          {sort === "plays" ? <span className="text-ink-subtle"> · {t("games.sort.playsNote")}</span> : null}
        </p>
        {filtering ? (
          <Button type="button" variant="ghost" size="sm" onClick={reset}>
            <X size={14} aria-hidden="true" />
            {t("games.filter.reset")}
          </Button>
        ) : null}
      </div>

      {visible.length > 0 ? (
        <div className="mt-3 grid grid-cols-2 gap-3 @md:grid-cols-3 @2xl:grid-cols-4 @4xl:grid-cols-5">
          {visible.map((game) => (
            <GameCard key={game.id} game={game} plays={playsOf(game)} />
          ))}
        </div>
      ) : (
        <p className="mt-6 rounded-xl border border-line bg-surface p-6 text-center text-small text-ink-muted">
          {t("games.filter.empty")}
        </p>
      )}
    </div>
  );
}
