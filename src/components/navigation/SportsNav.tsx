"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import type { Sport } from "@/types";
import { cn } from "@/lib/cn";
import { useT } from "@/i18n/I18nProvider";
import { ScrollFade } from "@/components/ui/ScrollFade";
import { StatusDot } from "@/components/ui/StatusDot";
import { SportIcon } from "@/components/sports/SportIcon";

export interface SportsNavProps {
  sports: Sport[];
  className?: string;
}

/**
 * The sport switcher.
 *
 * Sticky beneath the header, horizontally scrollable, and marked up as a real
 * `nav` with `aria-current` on the active sport rather than a styled div — a
 * keyboard user tabs through it in reading order and hears which sport they
 * are on.
 */
export function SportsNav({ sports, className }: SportsNavProps) {
  const t = useT();
  const pathname = usePathname();

  // Football is the landing sport, so /sports and / both light it up.
  const activeKey =
    pathname.startsWith("/sports/")
      ? pathname.split("/")[2]
      : pathname === "/sports" || pathname === "/"
        ? "football"
        : undefined;

  return (
    <nav
      aria-label={t("nav.sports")}
      className={cn(
        "glass sticky top-[var(--spacing-header)] z-40 border-b border-line",
        className,
      )}
    >
      <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8">
        <ScrollFade>
          <ul className="flex items-stretch gap-0.5 py-1.5">
            {sports.map((sport) => {
              const active = sport.key === activeKey;

              return (
                <li key={sport.id}>
                  <Link
                    href={`/sports/${sport.key}`}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group relative flex h-[38px] items-center gap-2 whitespace-nowrap rounded-md px-3 text-small font-medium transition-colors duration-fast",
                      active
                        ? "bg-primary-soft text-primary"
                        : "text-ink-muted hover:bg-surface-2 hover:text-ink",
                    )}
                  >
                    <SportIcon
                      name={sport.icon}
                      size={17}
                      className={active ? "text-primary" : "text-ink-subtle group-hover:text-ink-muted"}
                    />
                    {t(sport.nameKey)}

                    {sport.liveEventCount > 0 ? (
                      <span className="flex items-center gap-1">
                        <StatusDot tone="live" pulse size="xs" />
                        <span className="numeric text-caption font-semibold text-live">
                          {sport.liveEventCount}
                        </span>
                      </span>
                    ) : sport.eventCount > 0 ? (
                      <span className="numeric rounded-full bg-surface-3 px-1.5 text-caption font-semibold text-ink-subtle">
                        {sport.eventCount}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}

            <li>
              <Link
                href="/sports"
                className="flex h-[38px] items-center gap-2 whitespace-nowrap rounded-md px-3 text-small font-medium text-ink-muted transition-colors duration-fast hover:bg-surface-2 hover:text-ink"
              >
                <MoreHorizontal size={17} aria-hidden="true" className="text-ink-subtle" />
                {t("sports.more")}
              </Link>
            </li>
          </ul>
        </ScrollFade>
      </div>
    </nav>
  );
}
