"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { useT } from "@/i18n/I18nProvider";
import { SIDEBAR_COLLAPSED_VALUE, SIDEBAR_COOKIE } from "@/lib/sportsbookNav";
import { useUiStore } from "@/store/uiStore";
import { BetSlipPanel } from "@/components/betting/BetSlipPanel";
import { Drawer } from "@/components/ui/Drawer";
import { SportsRail } from "@/components/sports/SportsRail";
import { SportsSidebar } from "@/components/sports/SportsSidebar";
import { SportsbookNavTrigger } from "@/components/sports/SportsbookNavTrigger";
import { useSportsbookNav, type SportsbookNavData } from "@/components/sports/useSportsbookNav";

export interface SportsbookShellProps extends SportsbookNavData {
  /** Read from the cookie on the server, so the first paint has the right grid. */
  defaultCollapsed?: boolean;
  children: React.ReactNode;
  className?: string;
}

const ONE_YEAR = 60 * 60 * 24 * 365;

/** Matches Tailwind's `lg` — the width at which the rail replaces the drawer. */
const RAIL_QUERY = "(min-width: 1024px)";

/** Gap kept between the rail and the bottom of the viewport. */
const RAIL_BOTTOM_GAP = 16;

/**
 * The site frame: rail · page · slip.
 *
 * Rendered by a layout, not by each page, so the rail keeps its scroll
 * position, its open groups and its collapsed state as the user moves from the
 * homepage to a sport, a league, a match or a game — only the centre swaps.
 *
 *   ≥ xl   rail (264 | 60) · page · 340 slip   (no slip beside a casino game)
 *   lg     rail (228 | 60) · page              — slip moves to the bottom sheet
 *   < lg   page, with a selection bar that opens the rail as a drawer
 *
 * The page column is a size container, so a page lays its grids out against
 * the room it actually has beside the rail rather than the whole viewport.
 */
export function SportsbookShell({
  sports,
  competitions,
  countries,
  favorites,
  games,
  defaultCollapsed = false,
  children,
  className,
}: SportsbookShellProps) {
  const t = useT();
  const model = useSportsbookNav({ sports, competitions, countries, favorites, games });
  const pathname = usePathname();

  // A casino game stakes through its own panel; a sportsbook slip beside it
  // would be a second, unrelated place to put money down.
  const withSlip = !pathname.startsWith("/games");

  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [searchFocusRequest, setSearchFocusRequest] = useState(0);

  const drawerOpen = useUiStore((state) => state.sidebarOpen);
  const setDrawerOpen = useUiStore((state) => state.setSidebarOpen);
  const closeDrawer = useCallback(() => setDrawerOpen(false), [setDrawerOpen]);

  const persistCollapsed = useCallback((next: boolean) => {
    setCollapsed(next);
    document.cookie = next
      ? `${SIDEBAR_COOKIE}=${SIDEBAR_COLLAPSED_VALUE};path=/;max-age=${ONE_YEAR};samesite=lax`
      : `${SIDEBAR_COOKIE}=;path=/;max-age=0;samesite=lax`;
  }, []);

  const expandToSearch = useCallback(() => {
    persistCollapsed(false);
    setSearchFocusRequest((count) => count + 1);
  }, [persistCollapsed]);

  // Rotating a tablet into landscape brings the rail back; a drawer left open
  // behind it would be a second copy of the same navigation.
  useEffect(() => {
    const query = window.matchMedia(RAIL_QUERY);
    const onChange = () => {
      if (query.matches) closeDrawer();
    };
    query.addEventListener("change", onChange);
    return () => {
      query.removeEventListener("change", onChange);
      closeDrawer();
    };
  }, [closeDrawer]);

  const railRef = useRef<HTMLDivElement>(null);
  useRailFitsViewport(railRef);

  return (
    <div
      className={cn(
        "mx-auto grid max-w-[1440px] gap-6 px-4 py-6 sm:px-6 lg:px-8 xl:gap-7",
        "transition-[grid-template-columns] duration-(--duration-slow) ease-out-quint",
        withSlip
          ? collapsed
            ? "lg:grid-cols-[60px_minmax(0,1fr)] xl:grid-cols-[60px_minmax(0,1fr)_340px]"
            : "lg:grid-cols-[228px_minmax(0,1fr)] xl:grid-cols-[264px_minmax(0,1fr)_340px]"
          : collapsed
            ? "lg:grid-cols-[60px_minmax(0,1fr)]"
            : "lg:grid-cols-[228px_minmax(0,1fr)] xl:grid-cols-[264px_minmax(0,1fr)]",
        className,
      )}
    >
      <aside aria-label={t("sportsbook.nav.title")} className="hidden min-w-0 lg:block">
        <div
          ref={railRef}
          className={cn(
            "sticky top-[calc(var(--spacing-header)+var(--spacing-sportsnav)+1rem)]",
            // Server-render fallback; `useRailFitsViewport` replaces it with the
            // room actually left below the rail once the page is interactive.
            "flex max-h-[calc(100dvh-var(--spacing-header)-var(--spacing-sportsnav)-2rem)] flex-col",
            "overflow-hidden rounded-xl border border-line bg-surface edge-light",
          )}
        >
          {collapsed ? (
            <SportsRail
              model={model}
              onExpand={() => persistCollapsed(false)}
              onSearch={expandToSearch}
            />
          ) : (
            <SportsSidebar
              model={model}
              onCollapse={() => persistCollapsed(true)}
              searchFocusRequest={searchFocusRequest}
            />
          )}
        </div>
      </aside>

      <div className="@container min-w-0">
        <SportsbookNavTrigger
          model={model}
          expanded={drawerOpen}
          onOpen={() => setDrawerOpen(true)}
          className="mb-5 lg:hidden"
        />
        {children}
      </div>

      {withSlip ? (
        <div className="hidden xl:block">
          <BetSlipPanel />
        </div>
      ) : null}

      <Drawer
        side="start"
        open={drawerOpen}
        onClose={closeDrawer}
        title={t("sportsbook.nav.title")}
        scrollBody={false}
        className="max-w-[340px]"
      >
        <SportsSidebar model={model} variant="drawer" onNavigate={closeDrawer} />
      </Drawer>
    </div>
  );
}

/**
 * Keeps the sticky rail's bottom edge on screen.
 *
 * A CSS max-height can only assume the rail is already stuck under the header.
 * At the top of the page it is not — the demo banner and the page padding sit
 * above it — so that height overhangs the viewport and the last rows, exactly
 * where a sport or country unfolds, are cut off below the fold. This measures
 * the rail's real position as the page scrolls, resizes or the banner closes.
 */
function useRailFitsViewport(ref: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const rail = ref.current;
    if (!rail) return;

    let frame = 0;
    const fit = () => {
      frame = 0;
      const stuckAt = parseFloat(getComputedStyle(rail).top) || 0;
      // Once the layout's end pushes a stuck rail upwards, its top reads above
      // the sticky offset; clamping keeps the height steady while it leaves.
      const top = Math.max(rail.getBoundingClientRect().top, stuckAt);
      rail.style.maxHeight = `${Math.max(240, window.innerHeight - top - RAIL_BOTTOM_GAP)}px`;
    };
    const schedule = () => {
      if (frame === 0) frame = requestAnimationFrame(fit);
    };

    fit();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    // The banner closing, or a new page arriving, moves the rail with no
    // scroll or resize event at all.
    const observer = new ResizeObserver(schedule);
    observer.observe(document.body);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      observer.disconnect();
    };
  }, [ref]);
}
