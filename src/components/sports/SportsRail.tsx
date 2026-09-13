"use client";

import Link from "next/link";
import { useState, type FocusEvent, type MouseEvent, type ReactNode } from "react";
import { Gamepad2, PanelLeftOpen, Search } from "lucide-react";
import { cn } from "@/lib/cn";
import { useI18n } from "@/i18n/I18nProvider";
import { sportsbookHref } from "@/lib/sportsbookNav";
import { StatusDot } from "@/components/ui/StatusDot";
import { SportIcon } from "./SportIcon";
import type { SportsbookNav } from "./useSportsbookNav";

export interface SportsRailProps {
  model: SportsbookNav;
  onExpand: () => void;
  /** Expands the rail and puts the cursor in the league filter. */
  onSearch: () => void;
  className?: string;
}

interface Tip {
  label: string;
  /** Viewport y of the trigger's centre. */
  top: number;
  /** Distance from the inline-start edge of the viewport. */
  inset: number;
}

/**
 * The collapsed rail: sport icons, then the games lobby.
 *
 * The selection survives collapsing — a league keeps its sport lit — because
 * the rail reads the same selection as the full tree rather than tracking its
 * own. Labels appear on hover and focus; they are fixed-position so the rail's
 * own scroller cannot clip them.
 */
export function SportsRail({ model, onExpand, onSearch, className }: SportsRailProps) {
  const { t, dir } = useI18n();
  const [tip, setTip] = useState<Tip | null>(null);
  const { selection } = model;

  const showTip = (label: string) => (event: MouseEvent<HTMLElement> | FocusEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setTip({
      label,
      top: rect.top + rect.height / 2,
      inset: dir === "rtl" ? window.innerWidth - rect.left + 10 : rect.right + 10,
    });
  };
  const hideTip = () => setTip(null);

  const tipHandlers = (label: string) => ({
    onMouseEnter: showTip(label),
    onFocus: showTip(label),
    onMouseLeave: hideTip,
    onBlur: hideTip,
  });

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      <div className="flex shrink-0 flex-col items-center gap-1 border-b border-line-soft p-2">
        <RailButton label={t("sportsbook.nav.expand")} onClick={onExpand} {...tipHandlers(t("sportsbook.nav.expand"))}>
          <PanelLeftOpen size={17} aria-hidden="true" className="flip-rtl" />
        </RailButton>
        <RailButton label={t("sportsbook.nav.searchPlaceholder")} onClick={onSearch} {...tipHandlers(t("sportsbook.nav.searchPlaceholder"))}>
          <Search size={16} aria-hidden="true" />
        </RailButton>
      </div>

      <nav
        aria-label={t("sportsbook.nav.title")}
        onScroll={hideTip}
        className="scroll-slim min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain p-2"
      >
        <ul className="flex flex-col items-center gap-1">
          <li>
            <RailLink
              href={sportsbookHref.all()}
              label={t("sportsbook.allSports")}
              active={selection.scope === "all"}
              current={selection.scope === "all"}
              {...tipHandlers(t("sportsbook.allSports"))}
            >
              <SportIcon name="grid" size={16} />
            </RailLink>
          </li>
        </ul>

        <div aria-hidden="true" className="mx-auto my-2 h-px w-6 bg-line" />

        <ul className="flex flex-col items-center gap-1">
          {model.nav.map(({ sport }) => {
            const label = t(sport.nameKey);
            const inSport = selection.sportKey === sport.key;
            return (
              <li key={sport.id}>
                <RailLink
                  href={sportsbookHref.sport(sport.key)}
                  label={label}
                  active={inSport}
                  current={inSport && selection.scope === "sport"}
                  live={sport.liveEventCount > 0}
                  {...tipHandlers(label)}
                >
                  <SportIcon name={sport.icon} size={18} />
                </RailLink>
              </li>
            );
          })}
        </ul>

        {model.gamesNav.length > 0 ? (
          <>
            <div aria-hidden="true" className="mx-auto my-2 h-px w-6 bg-line" />
            <ul className="flex flex-col items-center gap-1">
              <li>
                <RailLink
                  href={sportsbookHref.games()}
                  label={t("nav.games")}
                  active={selection.scope === "games" || selection.scope === "game"}
                  current={selection.scope === "games"}
                  {...tipHandlers(t("nav.games"))}
                >
                  <Gamepad2 size={18} aria-hidden="true" />
                </RailLink>
              </li>
            </ul>
          </>
        ) : null}
      </nav>

      {tip ? (
        <span
          aria-hidden="true"
          style={{ top: tip.top, insetInlineStart: tip.inset }}
          className="pointer-events-none fixed z-80 -translate-y-1/2 whitespace-nowrap rounded-md border border-line bg-surface-3 px-2 py-1 text-caption normal-case tracking-normal text-ink shadow-e3 animate-fade-in"
        >
          {tip.label}
        </span>
      ) : null}
    </div>
  );
}

interface TipHandlers {
  onMouseEnter: (event: MouseEvent<HTMLElement>) => void;
  onFocus: (event: FocusEvent<HTMLElement>) => void;
  onMouseLeave: () => void;
  onBlur: () => void;
}

const ITEM =
  "relative grid size-10 place-items-center rounded-md outline-offset-[-2px] transition-colors duration-fast";

function RailButton({
  label,
  onClick,
  children,
  ...handlers
}: TipHandlers & { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(ITEM, "cursor-pointer text-ink-muted hover:bg-surface-2 hover:text-ink")}
      {...handlers}
    >
      {children}
    </button>
  );
}

function RailLink({
  href,
  label,
  active,
  current,
  live = false,
  children,
  ...handlers
}: TipHandlers & {
  href: string;
  label: string;
  /** Lit for the sport itself and for anything inside it. */
  active: boolean;
  /** Only the page actually being shown is `aria-current`. */
  current: boolean;
  live?: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      aria-current={current ? "page" : undefined}
      className={cn(
        ITEM,
        active
          ? "bg-primary-soft text-primary"
          : "text-ink-subtle hover:bg-surface-2 hover:text-ink",
      )}
      {...handlers}
    >
      {active ? (
        <span
          aria-hidden="true"
          className="absolute inset-y-2 -start-2 w-[3px] rounded-full bg-primary animate-fade-in"
        />
      ) : null}
      {children}
      {live ? (
        <span className="absolute end-1.5 top-1.5">
          <StatusDot tone="live" size="xs" />
        </span>
      ) : null}
    </Link>
  );
}
