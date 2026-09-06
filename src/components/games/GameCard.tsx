"use client";

import Link from "next/link";
import { Lock, Play, ShieldCheck } from "lucide-react";
import type { CasinoGame } from "@/types/games";
import { cn } from "@/lib/cn";
import { useT } from "@/i18n/I18nProvider";
import { Badge } from "@/components/ui/Badge";
import { GameArtwork } from "./GameArtwork";

export interface GameCardProps {
  game: CasinoGame;
  className?: string;
}

export function GameCard({ game, className }: GameCardProps) {
  const t = useT();
  const playable = game.status === "playable";
  const title = game.nameKey ? t(game.nameKey) : (game.name ?? game.slug);

  const body = (
    <>
      <GameArtwork slug={game.slug} hue={game.hue} />

      <div className="flex min-w-0 flex-1 flex-col p-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="min-w-0 truncate text-small font-semibold text-ink">{title}</h3>
          {playable ? (
            <span
              aria-hidden="true"
              className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-ink-inverse opacity-0 transition-opacity duration-base group-hover:opacity-100"
            >
              <Play size={11} className="ms-px fill-current" />
            </span>
          ) : (
            <Lock size={13} aria-hidden="true" className="mt-0.5 shrink-0 text-ink-subtle" />
          )}
        </div>

        {game.taglineKey ? (
          <p className="mt-0.5 truncate text-caption normal-case tracking-normal text-ink-subtle">
            {t(game.taglineKey)}
          </p>
        ) : null}

        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {game.status === "coming_soon" ? (
            <Badge tone="info">{t("ui.comingSoon")}</Badge>
          ) : game.status === "unavailable" ? (
            <Badge tone="neutral">{t("games.notConnected")}</Badge>
          ) : null}

          {game.provablyFair ? (
            <span className="inline-flex items-center gap-1 text-caption normal-case tracking-normal text-success">
              <ShieldCheck size={11} aria-hidden="true" />
              {t("games.provablyFair.short")}
            </span>
          ) : null}

          {game.rtp !== null ? (
            <span className="numeric text-caption normal-case tracking-normal text-ink-subtle">
              {game.rtpVariesByConfig
                ? t("games.rtpVaries")
                : t("games.rtpValue", { value: (game.rtp * 100).toFixed(2) })}
            </span>
          ) : null}
        </div>
      </div>
    </>
  );

  const shell = cn(
    "group flex flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-e2 transition-[border-color,transform] duration-base edge-light",
    playable
      ? "hover:-translate-y-px hover:border-line-strong"
      : "opacity-70 hover:opacity-100",
    className,
  );

  // An unavailable title is not a link. Making it clickable and then explaining
  // it does not work is a worse experience than saying so on the tile.
  if (!playable) {
    return (
      <article className={shell} aria-disabled="true">
        {body}
      </article>
    );
  }

  return (
    <Link href={`/games/${game.slug}`} className={shell}>
      {body}
    </Link>
  );
}
