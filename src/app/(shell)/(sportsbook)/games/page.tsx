import type { Metadata } from "next";
import Link from "next/link";
import { PlugZap, ShieldCheck } from "lucide-react";
import type { GameCategory } from "@/types/games";
import {
  getCategorySummaries,
  getGames,
  getProviders,
} from "@/services/gamesService";
import { getT } from "@/i18n/server";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Section } from "@/components/layout/Section";
import { GameCard } from "@/components/games/GameCard";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("games.title") };
}

const CATEGORY_ORDER: GameCategory[] = [
  "originals",
  "slots",
  "live_casino",
  "table_games",
  "game_shows",
];

export default async function GamesPage() {
  const [t, games, providers, categories] = await Promise.all([
    getT(),
    getGames(),
    getProviders(),
    getCategorySummaries(),
  ]);

  const byCategory = (category: GameCategory) =>
    games.filter((game) => game.category === category);

  const playable = games.filter((game) => game.status === "playable");

  return (
    <div>
      <header className="max-w-3xl">
        <h1 className="text-display text-ink">{t("games.title")}</h1>
        <p className="mt-2 text-body leading-relaxed text-ink-muted">
          {t("games.subtitle")}
        </p>
      </header>

      {/* Casino carries a heavier disclosure than the sportsbook, because the
          bet cycle is seconds rather than ninety minutes. */}
      <Alert tone="warning" className="mt-5 max-w-3xl" title={t("common.demo.badge")}>
        {t("games.lobbyNotice")}
      </Alert>

      <div className="mt-4 flex flex-wrap gap-2">
        {categories.map((summary) => (
          <span
            key={summary.category}
            className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-small text-ink-muted"
          >
            {t(`games.category.${summary.category}`)}
            <span className="numeric text-caption text-ink-subtle">
              {summary.playable > 0
                ? t("games.playableCount", {
                    playable: summary.playable,
                    total: summary.total,
                  })
                : summary.total}
            </span>
          </span>
        ))}
      </div>

      <Section
        className="mt-8"
        title={t("games.category.originals")}
        description={t("games.originals.description")}
        aside={
          <span className="inline-flex items-center gap-1.5 text-small font-semibold text-success">
            <ShieldCheck size={15} aria-hidden="true" />
            {t("games.provablyFair.short")}
          </span>
        }
      >
        <div className="grid grid-cols-2 gap-3 @md:grid-cols-3 @2xl:grid-cols-4 @4xl:grid-cols-5">
          {byCategory("originals").map((game) => (
            <GameCard key={game.id} game={game} />
          ))}
        </div>
      </Section>

      {CATEGORY_ORDER.filter((category) => category !== "originals").map((category) => {
        const entries = byCategory(category);
        if (entries.length === 0) return null;

        return (
          <Section
            key={category}
            className="mt-8"
            title={t(`games.category.${category}`)}
            description={t("games.providerSection.description")}
          >
            <div className="grid grid-cols-2 gap-3 @md:grid-cols-3 @2xl:grid-cols-4 @4xl:grid-cols-5">
              {entries.map((game) => (
                <GameCard key={game.id} game={game} />
              ))}
            </div>
          </Section>
        );
      })}

      {/* ------------------------------------------------------- providers -- */}
      <Section
        className="mt-10"
        title={t("games.providers.title")}
        description={t("games.providers.description")}
      >
        <div className="grid gap-3 @md:grid-cols-2 @4xl:grid-cols-4">
          {providers.map((provider) => {
            const connected = provider.status === "connected";
            return (
              <article
                key={provider.id}
                className="flex flex-col rounded-xl border border-line bg-surface p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <span
                    aria-hidden="true"
                    className="grid size-9 shrink-0 place-items-center rounded-lg border border-line-soft"
                    style={{
                      background: `linear-gradient(140deg, oklch(0.30 0.09 ${provider.hue}), oklch(0.20 0.05 ${provider.hue}))`,
                      color: `oklch(0.9 0.05 ${provider.hue})`,
                    }}
                  >
                    <PlugZap size={17} />
                  </span>
                  <Badge tone={connected ? "success" : "neutral"} dot>
                    {connected
                      ? t("games.provider.connected")
                      : t("games.provider.notConnected")}
                  </Badge>
                </div>

                <h3 className="mt-3 text-small font-semibold text-ink">{provider.name}</h3>
                <p className="mt-1 flex-1 text-caption normal-case leading-relaxed tracking-normal text-ink-muted">
                  {t(provider.descriptionKey)}
                </p>
                <p className="mt-2 text-caption normal-case tracking-normal text-ink-subtle">
                  {t(`games.integration.${provider.integration}`)}
                </p>
              </article>
            );
          })}
        </div>

        <p className="mt-4 max-w-3xl rounded-lg border border-line bg-surface p-4 text-small leading-relaxed text-ink-muted">
          {t("games.providers.explainer")}
        </p>
      </Section>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href="/games/fairness"
          className="text-small font-semibold text-primary underline-offset-2 hover:underline"
        >
          {t("games.fair.verifyCta")}
        </Link>
        <Link
          href="/responsible-gambling"
          className="text-small font-semibold text-primary underline-offset-2 hover:underline"
        >
          {t("footer.responsibleGambling")}
        </Link>
      </div>

      <p className="mt-6 max-w-3xl text-caption normal-case leading-relaxed tracking-normal text-ink-subtle">
        {t("games.playableSummary", { count: playable.length })}
      </p>
    </div>
  );
}
