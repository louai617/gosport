"use client";

import Link from "next/link";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { ChevronDown, Gamepad2, PanelLeftClose, Search, Star, X } from "lucide-react";
import type { Competition, Country } from "@/types";
import { cn } from "@/lib/cn";
import { useT } from "@/i18n/I18nProvider";
import {
  searchLeagues,
  sportsbookHref,
  type NavCountry,
  type NavGameCategory,
  type NavSport,
} from "@/lib/sportsbookNav";
import { CompetitionCrest } from "@/components/brand/CompetitionCrest";
import { GameIcon } from "@/components/games/GameIcon";
import { IconButton } from "@/components/ui/IconButton";
import { StatusDot } from "@/components/ui/StatusDot";
import { SportIcon } from "./SportIcon";
import { navNodeId, type SportsbookNav } from "./useSportsbookNav";

export type SportsSidebarVariant = "rail" | "drawer";

export interface SportsSidebarProps {
  model: SportsbookNav;
  /** `rail` sits in the page grid; `drawer` fills the mobile sheet with larger touch targets. */
  variant?: SportsSidebarVariant;
  /** Present only where the rail can collapse — not inside the drawer. */
  onCollapse?: () => void;
  /**
   * Called when the user reaches a destination — a league, a game, All sports.
   * Opening a sport or a country is a step on the way there, so it keeps the
   * drawer open to show what is inside.
   */
  onNavigate?: () => void;
  /** Incremented by the collapsed rail's search button to land focus in the field. */
  searchFocusRequest?: number;
  className?: string;
}

/**
 * The expanded navigation: a league filter, All sports, Popular, sport →
 * country → league, then the games lobby → category → game.
 *
 * Every row that leads somewhere is a real link to a real URL. Following a
 * parent always opens it — a click never folds away what the user just asked
 * to see — and the separate chevron is the one control that closes a group.
 */
export function SportsSidebar({
  model,
  variant = "rail",
  onCollapse,
  onNavigate,
  searchFocusRequest = 0,
  className,
}: SportsSidebarProps) {
  const t = useT();
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const { selection } = model;

  useEffect(() => {
    if (searchFocusRequest > 0) inputRef.current?.focus();
  }, [searchFocusRequest]);

  const touch = variant === "drawer";

  const actions: TreeActions = {
    model,
    touch,
    arrive: () => {
      setQuery("");
      onNavigate?.();
    },
    step: () => setQuery(""),
  };

  const playableGames = model.gamesNav.reduce((sum, entry) => sum + entry.games.length, 0);

  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col",
        // The rail animates its width open; a fixed minimum lets the content be
        // revealed by the widening column instead of reflowing on every frame.
        variant === "rail" && "min-w-[226px] xl:min-w-[262px]",
        className,
      )}
    >
      <div className="flex shrink-0 items-center gap-1.5 border-b border-line-soft p-2">
        <div className="relative min-w-0 flex-1">
          <Search
            size={14}
            aria-hidden="true"
            className="pointer-events-none absolute start-2.5 top-1/2 -translate-y-1/2 text-ink-subtle"
          />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && query) {
                event.stopPropagation();
                setQuery("");
              }
            }}
            placeholder={t("sportsbook.nav.searchPlaceholder")}
            aria-label={t("sportsbook.nav.searchPlaceholder")}
            autoComplete="off"
            spellCheck={false}
            className={cn(
              "w-full rounded-md border border-line bg-surface-2 ps-8 text-small text-ink",
              "transition-colors duration-fast placeholder:text-ink-subtle hover:border-line-strong focus:border-primary",
              "[&::-webkit-search-cancel-button]:hidden",
              touch ? "h-10" : "h-8",
              query ? "pe-8" : "pe-2.5",
            )}
          />
          {query ? (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
              aria-label={t("sportsbook.nav.clearSearch")}
              className="absolute end-1 top-1/2 grid size-6 -translate-y-1/2 cursor-pointer place-items-center rounded-sm text-ink-subtle transition-colors duration-fast hover:bg-surface-3 hover:text-ink"
            >
              <X size={13} aria-hidden="true" />
            </button>
          ) : null}
        </div>

        {onCollapse ? (
          <IconButton
            label={t("sportsbook.nav.collapse")}
            icon={<PanelLeftClose aria-hidden="true" className="flip-rtl" />}
            size="sm"
            onClick={onCollapse}
          />
        ) : null}
      </div>

      <nav
        aria-label={t("sportsbook.nav.title")}
        data-nav-scroller=""
        className="scroll-slim min-h-0 flex-1 overflow-y-auto overscroll-contain p-2"
      >
        {query.trim() ? (
          <LeagueResults actions={actions} query={query} />
        ) : (
          <>
            <ul>
              <li>
                <TreeRow
                  href={sportsbookHref.all()}
                  label={t("sportsbook.allSports")}
                  icon={<SportIcon name="grid" size={15} />}
                  count={<Count live={model.totals.live} total={model.totals.events} />}
                  state={selection.scope === "all" ? "active" : "idle"}
                  level={0}
                  touch={touch}
                  onNavigate={actions.arrive}
                />
              </li>
            </ul>

            {model.popular.length > 0 ? (
              <SectionGroup
                id={navNodeId.popular}
                label={t("sportsbook.nav.popular")}
                icon={<Star size={12} aria-hidden="true" />}
                actions={actions}
              >
                <LeagueList competitions={model.popular} actions={actions} withCrest />
              </SectionGroup>
            ) : null}

            <section className="mt-2 border-t border-line-soft pt-2">
              <h2 className="px-2.5 py-1.5 text-caption uppercase text-ink-subtle">
                {t("nav.sports")}
              </h2>
              <ul className="space-y-px">
                {model.nav.map((entry) => (
                  <SportNode key={entry.sport.id} entry={entry} actions={actions} />
                ))}
              </ul>
            </section>

            {model.gamesNav.length > 0 ? (
              <section className="mt-2 border-t border-line-soft pt-2">
                <h2 className="px-2.5 py-1.5 text-caption uppercase text-ink-subtle">
                  {t("nav.games")}
                </h2>
                <ul className="space-y-px">
                  <li>
                    <TreeRow
                      href={sportsbookHref.games()}
                      label={t("sportsbook.nav.allGames")}
                      icon={<Gamepad2 size={16} aria-hidden="true" />}
                      count={<Count live={0} total={playableGames} />}
                      state={selection.scope === "games" ? "active" : "idle"}
                      level={0}
                      touch={touch}
                      onNavigate={actions.arrive}
                    />
                  </li>
                  {model.gamesNav.map((entry) => (
                    <GameCategoryNode key={entry.category} entry={entry} actions={actions} />
                  ))}
                </ul>
              </section>
            ) : null}

            {model.favorites.length > 0 ? (
              <SectionGroup
                id={navNodeId.favorites}
                label={t("sportsbook.favorites")}
                actions={actions}
              >
                <LeagueList competitions={model.favorites} actions={actions} withCrest />
              </SectionGroup>
            ) : null}
          </>
        )}
      </nav>
    </div>
  );
}

/* ------------------------------------------------------------------- nodes */

interface TreeActions {
  model: SportsbookNav;
  touch: boolean;
  /** A destination was reached: clear the filter and let the drawer close. */
  arrive: () => void;
  /** A parent was followed: clear the filter but keep the navigation open. */
  step: () => void;
}

function SportNode({ entry, actions }: { entry: NavSport; actions: TreeActions }) {
  const t = useT();
  const panelId = useId();
  const { model } = actions;
  const { sport, popular, countries } = entry;
  const { selection } = model;

  const id = navNodeId.sport(sport.key);
  const open = model.isOpen(id);
  const inSport = selection.sportKey === sport.key;
  const state: RowState =
    inSport && selection.scope === "sport" ? "active" : inSport ? "path" : "idle";

  return (
    <li>
      <TreeRow
        href={sportsbookHref.sport(sport.key)}
        label={t(sport.nameKey)}
        icon={<SportIcon name={sport.icon} size={16} />}
        count={<Count live={sport.liveEventCount} total={sport.eventCount} />}
        state={state}
        level={0}
        touch={actions.touch}
        disclosure={{
          open,
          panelId,
          onToggle: (trigger) => toggleAndReveal(trigger, id, panelId, actions),
        }}
        onNavigate={(event) => followParent(event, state, id, panelId, actions)}
      />

      <Collapse open={open} id={panelId}>
        <ul className="ms-[19px] space-y-px border-s border-line-soft py-0.5 ps-1.5">
          {popular.length > 0 ? (
            <SportPopularNode sportKey={sport.key} competitions={popular} actions={actions} />
          ) : null}

          {countries.map((group) => (
            <CountryNode
              key={group.country.id}
              sportKey={sport.key}
              group={group}
              actions={actions}
            />
          ))}
        </ul>
      </Collapse>
    </li>
  );
}

/** A sport's flagship leagues, one tap from the sport without choosing a country. */
function SportPopularNode({
  sportKey,
  competitions,
  actions,
}: {
  sportKey: NavSport["sport"]["key"];
  competitions: Competition[];
  actions: TreeActions;
}) {
  const t = useT();
  const panelId = useId();
  const id = navNodeId.sportPopular(sportKey);
  const open = actions.model.isOpen(id);

  return (
    <li>
      <GroupRow
        label={t("sportsbook.nav.popular")}
        icon={<Star size={13} aria-hidden="true" />}
        open={open}
        panelId={panelId}
        state="idle"
        touch={actions.touch}
        onToggle={(trigger) => toggleAndReveal(trigger, id, panelId, actions)}
      />
      <Collapse open={open} id={panelId}>
        <div className="ms-[19px] border-s border-line-soft py-0.5 ps-1.5">
          <LeagueList competitions={competitions} actions={actions} level={2} />
        </div>
      </Collapse>
    </li>
  );
}

function CountryNode({
  sportKey,
  group,
  actions,
}: {
  sportKey: NavSport["sport"]["key"];
  group: NavCountry;
  actions: TreeActions;
}) {
  const t = useT();
  const panelId = useId();
  const { model } = actions;
  const { country, competitions } = group;
  const { selection } = model;

  const id = navNodeId.country(sportKey, country.id);
  const open = model.isOpen(id);
  const here = selection.sportKey === sportKey && selection.countryId === country.id;
  const state: RowState = here && selection.scope === "country" ? "active" : here ? "path" : "idle";

  return (
    <li>
      <TreeRow
        href={sportsbookHref.country(sportKey, country.code)}
        label={t(country.nameKey)}
        icon={<Flag country={country} />}
        count={<Count live={group.liveEventCount} total={group.eventCount} />}
        state={state}
        level={1}
        touch={actions.touch}
        disclosure={{
          open,
          panelId,
          onToggle: (trigger) => toggleAndReveal(trigger, id, panelId, actions),
        }}
        onNavigate={(event) => followParent(event, state, id, panelId, actions)}
      />

      <Collapse open={open} id={panelId}>
        <div className="ms-[19px] border-s border-line-soft py-0.5 ps-1.5">
          <LeagueList competitions={competitions} actions={actions} level={2} />
        </div>
      </Collapse>
    </li>
  );
}

function GameCategoryNode({ entry, actions }: { entry: NavGameCategory; actions: TreeActions }) {
  const t = useT();
  const panelId = useId();
  const { model } = actions;
  const id = navNodeId.gameCategory(entry.category);
  const open = model.isOpen(id);
  const inCategory = model.selection.gameCategory === entry.category;

  return (
    <li>
      <GroupRow
        label={t(`games.category.${entry.category}`)}
        icon={<GameIcon category={entry.category} size={15} />}
        count={<Count live={0} total={entry.games.length} />}
        open={open}
        panelId={panelId}
        state={inCategory ? "path" : "idle"}
        touch={actions.touch}
        onToggle={(trigger) => toggleAndReveal(trigger, id, panelId, actions)}
      />
      <Collapse open={open} id={panelId}>
        <ul className="ms-[19px] space-y-px border-s border-line-soft py-0.5 ps-1.5">
          {entry.games.map((game) => (
            <li key={game.id}>
              <TreeRow
                href={sportsbookHref.game(game.slug)}
                label={game.nameKey ? t(game.nameKey) : (game.name ?? game.slug)}
                icon={<GameIcon gameKey={game.key} category={game.category} size={14} />}
                state={model.selection.gameSlug === game.slug ? "active" : "idle"}
                level={2}
                touch={actions.touch}
                onNavigate={actions.arrive}
              />
            </li>
          ))}
        </ul>
      </Collapse>
    </li>
  );
}

function LeagueList({
  competitions,
  actions,
  withCrest = false,
  level = 0,
}: {
  competitions: Competition[];
  actions: TreeActions;
  withCrest?: boolean;
  level?: RowLevel;
}) {
  return (
    <ul className="space-y-px">
      {competitions.map((competition) => (
        <li key={competition.id}>
          <TreeRow
            href={sportsbookHref.competition(competition.id)}
            label={competition.name}
            icon={
              withCrest ? (
                <CompetitionCrest
                  name={competition.name}
                  monogram={competition.monogram}
                  hue={competition.hue}
                  size="xs"
                />
              ) : undefined
            }
            count={<Count live={competition.liveEventCount} total={competition.eventCount} />}
            state={actions.model.selection.competitionId === competition.id ? "active" : "idle"}
            level={level}
            touch={actions.touch}
            onNavigate={actions.arrive}
          />
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ search */

function LeagueResults({ actions, query }: { actions: TreeActions; query: string }) {
  const t = useT();
  const { model, touch } = actions;

  const matches = useMemo(
    () =>
      searchLeagues(model.nav, query, {
        sport: (sport) => t(sport.nameKey),
        country: (country) => t(country.nameKey),
      }),
    [model.nav, query, t],
  );

  return (
    <div>
      <p
        aria-live="polite"
        className="flex items-center justify-between px-2.5 pb-1.5 pt-1 text-caption uppercase text-ink-subtle"
      >
        {t("sportsbook.competitions")}
        <span className="numeric">{matches.length}</span>
      </p>

      {matches.length === 0 ? (
        <div className="px-3 py-8 text-center">
          <Search size={18} aria-hidden="true" className="mx-auto mb-2 text-ink-subtle" />
          <p className="text-small font-medium text-ink">
            {t("sportsbook.nav.noLeagues", { query: query.trim() })}
          </p>
          <p className="mt-1 text-caption normal-case tracking-normal text-ink-subtle">
            {t("sportsbook.nav.noLeaguesHint")}
          </p>
        </div>
      ) : (
        <ul className="space-y-px">
          {matches.map(({ competition, sport, country }) => {
            const active = model.selection.competitionId === competition.id;
            return (
              <li key={competition.id}>
                <Link
                  href={sportsbookHref.competition(competition.id)}
                  onClick={actions.arrive}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex items-center gap-2.5 rounded-md px-2.5 outline-offset-[-2px] transition-colors duration-fast",
                    touch ? "py-2.5" : "py-1.5",
                    active ? "bg-primary-soft" : "hover:bg-surface-2",
                  )}
                >
                  {active ? <ActiveMark level={0} /> : null}
                  <CompetitionCrest
                    name={competition.name}
                    monogram={competition.monogram}
                    hue={competition.hue}
                    size="sm"
                  />
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "block truncate text-small",
                        active ? "font-semibold text-primary" : "font-medium text-ink",
                      )}
                    >
                      {competition.name}
                    </span>
                    <span className="flex items-center gap-1.5 truncate text-caption normal-case tracking-normal text-ink-subtle">
                      <SportIcon name={sport.icon} size={11} />
                      <span aria-hidden="true">{country.flag}</span>
                      <span className="truncate">{t(country.nameKey)}</span>
                    </span>
                  </span>
                  <Count live={competition.liveEventCount} total={competition.eventCount} />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* -------------------------------------------------------------- primitives */

type RowState = "idle" | "path" | "active";
type RowLevel = 0 | 1 | 2;

interface TreeRowProps {
  href: string;
  label: string;
  icon?: ReactNode;
  count?: ReactNode;
  state: RowState;
  level: RowLevel;
  touch: boolean;
  disclosure?: { open: boolean; panelId: string; onToggle: (trigger: HTMLElement) => void };
  onNavigate?: (event: MouseEvent<HTMLAnchorElement>) => void;
}

/**
 * One navigable row. `path` is the quieter state for the ancestors of the
 * active row — Football while Premier League is open — so the trail to the
 * selection stays legible without competing with the selection itself.
 */
function TreeRow({
  href,
  label,
  icon,
  count,
  state,
  level,
  touch,
  disclosure,
  onNavigate,
}: TreeRowProps) {
  const t = useT();

  return (
    <div
      data-tree-row=""
      className={cn(
        "group/row relative flex items-center rounded-md transition-colors duration-fast",
        state === "active" ? "bg-primary-soft" : "hover:bg-surface-2",
      )}
    >
      {state === "active" ? <ActiveMark level={level} /> : null}

      <Link
        href={href}
        onClick={onNavigate}
        aria-current={state === "active" ? "page" : undefined}
        title={label}
        className={cn(
          "flex min-w-0 flex-1 items-center gap-2.5 rounded-md ps-2.5 text-small outline-offset-[-2px] transition-colors duration-fast",
          touch ? "min-h-10" : level === 0 ? "min-h-[33px]" : "min-h-[31px]",
          disclosure ? "pe-1" : "pe-2.5",
          rowText(state),
        )}
      >
        {icon ? <RowIcon state={state}>{icon}</RowIcon> : null}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {count}
      </Link>

      {disclosure ? (
        <button
          type="button"
          onClick={(event) => disclosure.onToggle(event.currentTarget)}
          aria-expanded={disclosure.open}
          aria-controls={disclosure.panelId}
          aria-label={t(
            disclosure.open ? "sportsbook.nav.collapseGroup" : "sportsbook.nav.expandGroup",
            { name: label },
          )}
          className={cn(
            "me-0.5 grid shrink-0 cursor-pointer place-items-center rounded-sm text-ink-subtle outline-offset-[-2px] transition-colors duration-fast hover:bg-surface-3 hover:text-ink",
            touch ? "size-9" : "size-7",
          )}
        >
          <Chevron open={disclosure.open} />
        </button>
      ) : null}
    </div>
  );
}

/** A row that only opens and closes — a group with no page of its own. */
function GroupRow({
  label,
  icon,
  count,
  open,
  panelId,
  state,
  touch,
  onToggle,
}: {
  label: string;
  icon: ReactNode;
  count?: ReactNode;
  open: boolean;
  panelId: string;
  state: RowState;
  touch: boolean;
  onToggle: (trigger: HTMLElement) => void;
}) {
  return (
    <div data-tree-row="" className="group/row">
      <button
        type="button"
        onClick={(event) => onToggle(event.currentTarget)}
        aria-expanded={open}
        aria-controls={panelId}
        className={cn(
          "flex w-full cursor-pointer items-center gap-2.5 rounded-md ps-2.5 pe-1 text-start text-small outline-offset-[-2px] transition-colors duration-fast hover:bg-surface-2",
          touch ? "min-h-10" : "min-h-[31px]",
          rowText(state),
        )}
      >
        <RowIcon state={state}>{icon}</RowIcon>
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {count}
        <span
          className={cn(
            "grid shrink-0 place-items-center text-ink-subtle",
            touch ? "size-9" : "size-7",
          )}
        >
          <Chevron open={open} />
        </span>
      </button>
    </div>
  );
}

function rowText(state: RowState): string {
  return state === "active"
    ? "font-semibold text-primary"
    : state === "path"
      ? "font-medium text-ink"
      : "text-ink-muted group-hover/row:text-ink";
}

function RowIcon({ state, children }: { state: RowState; children: ReactNode }) {
  return (
    <span
      className={cn(
        "flex w-5 shrink-0 justify-center transition-colors duration-fast",
        state === "idle" ? "text-ink-subtle group-hover/row:text-ink-muted" : "text-primary",
      )}
    >
      {children}
    </span>
  );
}

/**
 * Top-level rows carry the accent inside their highlight; nested rows lay it
 * over the tree guide instead, so the selected league lights its own segment of
 * the line that joins it to its country.
 */
function ActiveMark({ level }: { level: RowLevel }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "absolute inset-y-1.5 w-[3px] rounded-full bg-primary animate-fade-in",
        level === 0 ? "start-0" : "-start-[8px]",
      )}
    />
  );
}

function SectionGroup({
  id,
  label,
  icon,
  actions,
  children,
}: {
  id: string;
  label: string;
  icon?: ReactNode;
  actions: TreeActions;
  children: ReactNode;
}) {
  const panelId = useId();
  const open = actions.model.isOpen(id);

  return (
    <section className="mt-2 border-t border-line-soft pt-2">
      <h2 data-tree-row="">
        <button
          type="button"
          onClick={(event) => toggleAndReveal(event.currentTarget, id, panelId, actions)}
          aria-expanded={open}
          aria-controls={panelId}
          className={cn(
            "flex w-full cursor-pointer items-center gap-1.5 rounded-md ps-2.5 pe-1 text-caption uppercase text-ink-subtle outline-offset-[-2px] transition-colors duration-fast hover:text-ink-muted",
            actions.touch ? "min-h-10" : "min-h-7",
          )}
        >
          {icon}
          <span className="flex-1 text-start">{label}</span>
          <span className="grid size-7 place-items-center">
            <Chevron open={open} />
          </span>
        </button>
      </h2>
      <Collapse open={open} id={panelId}>
        {children}
      </Collapse>
    </section>
  );
}

/**
 * Height animates through a 0fr → 1fr grid track, which needs no measuring and
 * survives content changing while open; the rows drift down a few pixels as
 * they fade in, so a group reads as unfolding rather than blinking. Closed
 * panels are `inert`, so their links leave the tab order and the
 * accessibility tree along with the screen.
 */
function Collapse({ open, id, children }: { open: boolean; id: string; children: ReactNode }) {
  return (
    <div
      id={id}
      inert={!open}
      className={cn(
        "grid transition-[grid-template-rows] duration-(--duration-slow) ease-out-quint",
        open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
      )}
    >
      <div
        className={cn(
          "min-h-0 overflow-hidden transition-[opacity,translate] duration-(--duration-slow) ease-out-quint",
          open ? "translate-y-0 opacity-100" : "-translate-y-1 opacity-0",
        )}
      >
        {children}
      </div>
    </div>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <ChevronDown
      size={14}
      aria-hidden="true"
      className={cn(
        "transition-transform duration-(--duration-base) ease-out-quint",
        !open && "-rotate-90 rtl:rotate-90",
      )}
    />
  );
}

function Flag({ country }: { country: Country }) {
  return (
    <span aria-hidden="true" className="text-[14px] leading-none">
      {country.flag}
    </span>
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
  return (
    <span className="numeric shrink-0 text-caption font-medium text-ink-subtle">{total}</span>
  );
}

/* --------------------------------------------------------------- behaviour */

/**
 * Following a sport or a country is a request to see what is inside it, so it
 * always leaves the group open — including when it is already the page on
 * screen. It stays a real link, so the board follows; in the drawer it keeps
 * the sheet open for the next step down.
 */
function followParent(
  event: MouseEvent<HTMLAnchorElement>,
  state: RowState,
  id: string,
  panelId: string,
  actions: TreeActions,
) {
  // A modified click opens a new tab; this view is not the one navigating.
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

  if (!actions.model.isOpen(id)) actions.model.open(id);
  revealChildren(event.currentTarget, panelId);

  if (state === "active") {
    // The board already shows this page; there is nothing to load.
    event.preventDefault();
    return;
  }
  actions.step();
}

function toggleAndReveal(trigger: HTMLElement, id: string, panelId: string, actions: TreeActions) {
  const opening = !actions.model.isOpen(id);
  actions.model.toggle(id);
  if (opening) revealChildren(trigger, panelId);
}

/**
 * Scrolls the navigation just far enough to bring a group that is opening into
 * view, in step with the unfold, without pushing the clicked row off the top.
 * A group near the bottom edge would otherwise unfold out of sight and look as
 * if the click did nothing.
 */
function revealChildren(trigger: HTMLElement, panelId: string) {
  requestAnimationFrame(() => {
    const scroller = trigger.closest<HTMLElement>("[data-nav-scroller]");
    const row = trigger.closest<HTMLElement>("[data-tree-row]");
    // The panel always directly follows its row. Looked up from the row rather
    // than by id, because the rail and the drawer can both be in the document.
    const panel = row?.nextElementSibling;
    const content = panel?.id === panelId ? panel.firstElementChild : null;
    if (!scroller || !row || !(content instanceof HTMLElement)) return;

    const bounds = scroller.getBoundingClientRect();
    const rowBox = row.getBoundingClientRect();
    // `scrollHeight` is the full height the panel is animating towards, even
    // while its track is still collapsed.
    const overflow = rowBox.bottom + content.scrollHeight + 8 - bounds.bottom;
    const room = rowBox.top - bounds.top - 8;
    const distance = Math.min(overflow, room);
    if (distance <= 0) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    scroller.scrollBy({ top: distance, behavior: reduced ? "auto" : "smooth" });
  });
}
