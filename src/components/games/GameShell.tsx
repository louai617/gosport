"use client";

import Link from "next/link";
import { ChevronLeft, ShieldCheck } from "lucide-react";
import type { CasinoGame } from "@/types/games";
import { cn } from "@/lib/cn";
import { useT } from "@/i18n/I18nProvider";
import { Alert } from "@/components/ui/Alert";
import { SimulatedBadge } from "@/components/ui/SimulatedBadge";
import { FairnessPanel } from "./FairnessPanel";
import { RoundHistory } from "./RoundHistory";

export interface GameShellProps {
  game: CasinoGame;
  /**
   * The game renders exactly two top-level elements: the playfield, then its
   * control panel. Grid auto-placement puts them in the two columns and the
   * shell's own panels on the row beneath, so a game never repeats this layout
   * and the single-column order on mobile stays board → controls → the rest.
   */
  children: React.ReactNode;
  className?: string;
}

/**
 * Frame shared by every original.
 *
 * Board on the inline-start, controls on the end — the same side as the bet
 * slip on the sportsbook, so the "where do I stake" answer is one answer
 * across the whole product.
 */
export function GameShell({ game, children, className }: GameShellProps) {
  const t = useT();
  const title = game.nameKey ? t(game.nameKey) : (game.name ?? game.slug);

  return (
    <div className={cn("mx-auto max-w-[1200px] px-4 py-6 sm:px-6 lg:px-8", className)}>
      <Link
        href="/games"
        className="inline-flex items-center gap-1.5 text-small text-ink-muted transition-colors duration-fast hover:text-ink"
      >
        <ChevronLeft size={15} aria-hidden="true" className="flip-rtl" />
        {t("games.title")}
      </Link>

      <header className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-h1 text-ink">{title}</h1>
          {game.taglineKey ? (
            <p className="mt-1 text-small text-ink-muted">{t(game.taglineKey)}</p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {game.provablyFair ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success-soft px-2.5 py-1 text-caption font-semibold uppercase text-success">
              <ShieldCheck size={12} aria-hidden="true" />
              {t("games.provablyFair.short")}
            </span>
          ) : null}
          {game.rtp !== null ? (
            <span className="numeric rounded-full border border-line bg-surface-2 px-2.5 py-1 text-caption text-ink-muted">
              {game.rtpVariesByConfig
                ? t("games.rtpVaries")
                : t("games.rtpValue", { value: (game.rtp * 100).toFixed(2) })}
            </span>
          ) : null}
          <SimulatedBadge variant="block" />
        </div>
      </header>

      {/* Stated once, above the playfield, before any stake is entered. */}
      <Alert tone="warning" className="mt-4" title={t("common.demo.badge")}>
        {t("games.demoNotice")}
      </Alert>

      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        {children}
        <RoundHistory gameKey={game.key} />
        <FairnessPanel />
      </div>
    </div>
  );
}
