"use client";

import { ServerCog } from "lucide-react";
import { useT } from "@/i18n/I18nProvider";

/**
 * Shown instead of the provably-fair panel for games that are not.
 *
 * Blackjack and roulette resolve on the server from a CSPRNG with no
 * commitment the player can check afterwards. That is a weaker guarantee than
 * the commit–reveal originals offer, and saying so is better than showing a
 * fairness badge the game has not earned.
 */
export function ServerFairnessNote() {
  const t = useT();

  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <h2 className="flex items-center gap-2 text-caption uppercase text-ink-subtle">
        <ServerCog size={13} aria-hidden="true" />
        {t("games.serverFair.title")}
      </h2>
      <p className="mt-2 text-caption normal-case leading-relaxed tracking-normal text-ink-muted">
        {t("games.serverFair.body")}
      </p>
    </section>
  );
}
