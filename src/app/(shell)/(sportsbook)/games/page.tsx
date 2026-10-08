import type { Metadata } from "next";
import Link from "next/link";
import { PlugZap } from "lucide-react";
import type { GameCategory } from "@/types/games";
import { getGamesByPlays, getProviders } from "@/services/gamesService";
import { getT } from "@/i18n/server";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Section } from "@/components/layout/Section";
import { GamesBrowser } from "@/components/games/GamesBrowser";

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

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function GamesPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const [t, { games, plays }, providers] = await Promise.all([
    getT(),
    getGamesByPlays(),
    getProviders(),
  ]);

  const requested = typeof params.category === "string" ? params.category : "all";
  const initialCategory = (CATEGORY_ORDER as string[]).includes(requested)
    ? (requested as GameCategory)
    : "all";

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

      <div className="mt-4">
        <GamesBrowser
          games={games}
          plays={plays}
          categories={CATEGORY_ORDER}
          initialCategory={initialCategory}
        />
      </div>

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
