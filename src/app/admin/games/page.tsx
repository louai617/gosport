import type { Metadata } from "next";
import { PlugZap } from "lucide-react";
import { getGames, getProviders } from "@/services/gamesService";
import { getAdminT } from "@/i18n/server";
import { Alert } from "@/components/ui/Alert";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/Table";

export const metadata: Metadata = { title: "Games" };

const STATUS_TONE: Record<string, BadgeTone> = {
  playable: "success",
  coming_soon: "info",
  unavailable: "neutral",
};

/**
 * Operator view of the casino catalogue.
 *
 * Leads with provider connection state rather than game counts: for an
 * operator the only question that matters here is which studios are actually
 * live, and a catalogue of titles nobody can open reads as healthy unless the
 * page says otherwise.
 */
export default async function AdminGamesPage() {
  const [t, games, providers] = await Promise.all([
    getAdminT(),
    getGames(),
    getProviders(),
  ]);

  const connected = providers.filter((p) => p.status === "connected").length;
  const playable = games.filter((game) => game.status === "playable").length;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-h1 text-ink">{t("admin.games.title")}</h1>
        <p className="mt-1 max-w-prose text-small text-ink-muted">
          {t("admin.games.description")}
        </p>
      </header>

      <Alert tone="warning" title={t("common.demo.badge")}>
        {t("admin.games.demoNotice")}
      </Alert>

      <section aria-labelledby="providers-heading">
        <h2 id="providers-heading" className="mb-3 text-h2 text-ink">
          {t("games.providers.title")}
        </h2>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {providers.map((provider) => {
            const isConnected = provider.status === "connected";
            const supplied = games.filter((game) => game.providerId === provider.id);

            return (
              <article
                key={provider.id}
                className="rounded-xl border border-line bg-surface p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <PlugZap
                    size={17}
                    aria-hidden="true"
                    className={isConnected ? "text-success" : "text-ink-subtle"}
                  />
                  <Badge tone={isConnected ? "success" : "danger"} dot>
                    {isConnected
                      ? t("games.provider.connected")
                      : t("games.provider.notConnected")}
                  </Badge>
                </div>

                <h3 className="mt-2.5 text-small font-semibold text-ink">
                  {provider.name}
                </h3>
                <p className="numeric mt-1 text-caption normal-case tracking-normal text-ink-subtle">
                  {t("admin.games.supplied", { count: supplied.length })}
                </p>
                <p className="mt-1.5 text-caption normal-case tracking-normal text-ink-subtle">
                  {t(`games.integration.${provider.integration}`)}
                </p>
              </article>
            );
          })}
        </div>

        <p className="numeric mt-3 text-small text-ink-muted">
          {t("admin.games.summary", {
            connected,
            providers: providers.length,
            playable,
            total: games.length,
          })}
        </p>
      </section>

      <section aria-labelledby="catalogue-heading">
        <h2 id="catalogue-heading" className="mb-3 text-h2 text-ink">
          {t("admin.games.catalogue")}
        </h2>

        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <Table>
            <THead>
              <tr>
                <TH>{t("admin.games.game")}</TH>
                <TH>{t("admin.column.kind")}</TH>
                <TH className="hidden md:table-cell">{t("games.providers.title")}</TH>
                <TH align="end">{t("games.provablyFair.short")}</TH>
                <TH align="end">{t("admin.games.rtp")}</TH>
                <TH align="end">{t("admin.column.status")}</TH>
              </tr>
            </THead>
            <TBody>
              {games.map((game) => {
                const provider = providers.find((p) => p.id === game.providerId);
                return (
                  <TR key={game.id}>
                    <TD>
                      <span className="font-medium text-ink">
                        {game.nameKey ? t(game.nameKey) : (game.name ?? game.slug)}
                      </span>
                      <span className="numeric block text-caption normal-case tracking-normal text-ink-subtle">
                        {game.slug}
                      </span>
                    </TD>
                    <TD className="text-ink-muted">
                      {t(`games.category.${game.category}`)}
                    </TD>
                    <TD className="hidden text-ink-muted md:table-cell">
                      {provider?.name ?? "—"}
                    </TD>
                    <TD align="end">
                      {game.provablyFair ? (
                        <Badge tone="success">{t("ui.yes")}</Badge>
                      ) : (
                        <span className="text-ink-subtle">—</span>
                      )}
                    </TD>
                    <TD align="end" numeric className="text-ink-muted">
                      {game.rtp === null
                        ? "—"
                        : game.rtpVariesByConfig
                          ? t("games.rtpVaries")
                          : `${(game.rtp * 100).toFixed(2)}%`}
                    </TD>
                    <TD align="end">
                      <Badge tone={STATUS_TONE[game.status] ?? "neutral"} dot>
                        {t(`admin.games.status.${game.status}`)}
                      </Badge>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </div>
      </section>
    </div>
  );
}
