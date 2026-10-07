"use client";

import { useEffect, useState } from "react";
import type { BlackjackView, Card, HandResult, Suit } from "@/lib/games/blackjack";
import { cn } from "@/lib/cn";
import { formatAmount } from "@/lib/format";
import { GAME_STAKE, round2 } from "@/lib/games/constants";
import { useI18n } from "@/i18n/I18nProvider";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useWallet } from "@/components/wallet/WalletProvider";

const SUIT_GLYPH: Record<Suit, string> = {
  spades: "♠",
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
};

const RESULT_TONE: Record<HandResult, BadgeTone> = {
  WIN: "success",
  BLACKJACK: "success",
  LOSE: "danger",
  BUST: "danger",
  PUSH: "neutral",
};

export function BlackjackBoard() {
  const { t, locale } = useI18n();
  const { balance, ready, signedIn, play, act, resume } = useWallet();

  const [stake, setStake] = useState(5);
  const [view, setView] = useState<BlackjackView | null>(null);
  const [roundId, setRoundId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inHand = view !== null && view.phase !== "settled";

  // A reload mid-hand resumes it: the stake is already taken, and the hand is
  // held on the server, so it is shown again rather than stranded.
  useEffect(() => {
    if (!ready || !signedIn) return;
    let cancelled = false;
    void resume<BlackjackView>("blackjack").then((open) => {
      if (cancelled || !open || open.settled) return;
      setView(open.result);
      setRoundId(open.roundId);
    });
    return () => {
      cancelled = true;
    };
  }, [ready, signedIn, resume]);

  const deal = async () => {
    setBusy(true);
    setError(null);

    const response = await play<BlackjackView>("blackjack", { stake });
    if (!response.ok || !response.result) {
      setError(response.errorKey ?? "error.generic");
      setBusy(false);
      return;
    }

    setView(response.result);
    setRoundId(response.roundId ?? null);
    setBusy(false);
  };

  const send = async (action: string) => {
    if (!roundId || busy) return;
    setBusy(true);
    setError(null);

    const response = await act<BlackjackView>("blackjack", roundId, action);
    if (!response.ok || !response.result) {
      setError(response.errorKey ?? "error.generic");
      setBusy(false);
      return;
    }

    setView(response.result);
    setBusy(false);
  };

  const settledReturn = view?.phase === "settled" ? view.totalReturn : null;
  const netProfit =
    view?.phase === "settled" ? round2(view.totalReturn - view.totalStaked) : null;

  return (
    <>
      <section className="rounded-xl border border-line bg-surface p-4 sm:p-5">
        {/* ------------------------------------------------------- dealer -- */}
        <div className="mb-5">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-caption uppercase text-ink-subtle">
              {t("games.blackjack.dealer")}
            </span>
            {view?.dealerValue ? (
              <span className="numeric text-caption font-semibold text-ink">
                {view.dealerValue.total}
                {view.dealerValue.soft ? "s" : ""}
              </span>
            ) : null}
          </div>
          <CardRow cards={view?.dealer ?? []} hidden={view ? view.dealerValue === null : false} />
        </div>

        {/* ------------------------------------------------------- player -- */}
        <div className="space-y-4">
          {(view?.hands ?? []).map((hand, index) => (
            <div key={index}>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="text-caption uppercase text-ink-subtle">
                  {view!.hands.length > 1
                    ? t("games.blackjack.handN", { n: index + 1 })
                    : t("games.blackjack.you")}
                </span>
                <span className="numeric text-caption font-semibold text-ink">
                  {hand.value.total}
                  {hand.value.soft ? "s" : ""}
                </span>
                <span className="numeric text-caption text-ink-subtle">
                  {formatAmount(hand.bet, locale)}
                </span>
                {hand.result ? (
                  <Badge tone={RESULT_TONE[hand.result]}>
                    {t(`games.blackjack.result.${hand.result}`)}
                  </Badge>
                ) : null}
                {index === view!.active && inHand ? (
                  <Badge tone="primary" dot>
                    {t("games.blackjack.acting")}
                  </Badge>
                ) : null}
              </div>
              <CardRow cards={hand.cards} />
            </div>
          ))}

          {!view ? (
            <p className="py-8 text-center text-small text-ink-subtle">
              {t("games.blackjack.prompt")}
            </p>
          ) : null}
        </div>

        {settledReturn !== null ? (
          <p
            aria-live="polite"
            className={cn(
              "numeric mt-5 text-center text-h3 font-bold",
              netProfit! > 0 ? "text-success" : netProfit! < 0 ? "text-danger" : "text-ink-muted",
            )}
          >
            {netProfit! > 0 ? "+" : ""}
            {formatAmount(netProfit!, locale)}
          </p>
        ) : null}
      </section>

      {/* ------------------------------------------------------- controls -- */}
      <section className="rounded-xl border border-line bg-surface p-4">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-caption uppercase text-ink-subtle">
            {t("games.sessionBalance")}
          </h2>
          <p className="numeric text-h3 font-bold text-ink">
            {balance === null ? "—" : formatAmount(balance, locale)}
          </p>
        </div>

        {inHand ? (
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button onClick={() => send("hit")} disabled={busy}>
              {t("games.blackjack.hit")}
            </Button>
            <Button variant="secondary" onClick={() => send("stand")} disabled={busy}>
              {t("games.blackjack.stand")}
            </Button>
            <Button
              variant="outline"
              onClick={() => send("double")}
              disabled={busy || !view?.canDouble}
            >
              {t("games.blackjack.double")}
            </Button>
            <Button
              variant="outline"
              onClick={() => send("split")}
              disabled={busy || !view?.canSplit}
            >
              {t("games.blackjack.split")}
            </Button>
          </div>
        ) : (
          <>
            <div className="mt-4">
              <label
                htmlFor="bj-stake"
                className="mb-1.5 block text-small text-ink-muted"
              >
                {t("betslip.stake")}
              </label>
              <input
                id="bj-stake"
                inputMode="decimal"
                value={stake}
                onChange={(event) => {
                  const parsed = Number.parseFloat(event.target.value);
                  if (!Number.isNaN(parsed)) {
                    setStake(
                      round2(Math.min(GAME_STAKE.max, Math.max(GAME_STAKE.min, parsed))),
                    );
                  }
                }}
                className="numeric h-11 w-full rounded-md border border-line bg-surface-2 px-3 text-h3 font-semibold text-ink transition-colors duration-fast hover:border-line-strong focus:border-primary"
              />
            </div>

            <Button
              fullWidth
              size="lg"
              className="mt-4"
              loading={busy || !ready}
              disabled={busy || !ready}
              onClick={deal}
            >
              {view ? t("games.blackjack.dealAgain") : t("games.blackjack.deal")}
            </Button>
          </>
        )}

        {error ? (
          <p role="alert" className="mt-3 text-caption normal-case tracking-normal text-danger">
            {t(error)}
          </p>
        ) : null}

        <p className="mt-3 text-caption normal-case leading-relaxed tracking-normal text-ink-subtle">
          {t("games.blackjack.rules")}
        </p>
      </section>
    </>
  );
}

function CardRow({ cards, hidden = false }: { cards: Card[]; hidden?: boolean }) {
  return (
    <div dir="ltr" className="flex flex-wrap gap-1.5">
      {cards.map((card, index) => (
        <PlayingCard key={`${card.rank}-${card.suit}-${index}`} card={card} />
      ))}
      {hidden ? <FaceDownCard /> : null}
      {cards.length === 0 && !hidden ? (
        <div className="h-[68px] w-12 rounded-md border border-dashed border-line-soft" />
      ) : null}
    </div>
  );
}

function PlayingCard({ card }: { card: Card }) {
  const red = card.suit === "hearts" || card.suit === "diamonds";

  return (
    <div
      className={cn(
        "flex h-[68px] w-12 flex-col items-center justify-center rounded-md border bg-surface-2 shadow-e1 animate-pop",
        red ? "border-danger/40" : "border-line-strong",
      )}
    >
      <span className={cn("numeric text-small font-bold", red ? "text-danger" : "text-ink")}>
        {card.rank}
      </span>
      <span
        aria-hidden="true"
        className={cn("text-h3 leading-none", red ? "text-danger" : "text-ink")}
      >
        {SUIT_GLYPH[card.suit]}
      </span>
    </div>
  );
}

/** The hole card. Its value is not in the payload at all, not merely hidden. */
function FaceDownCard() {
  return (
    <div
      aria-label="face down"
      className="h-[68px] w-12 rounded-md border border-line-strong bg-primary-soft"
      style={{
        backgroundImage:
          "repeating-linear-gradient(45deg, transparent 0 4px, color-mix(in oklab, var(--color-primary) 22%, transparent) 4px 8px)",
      }}
    />
  );
}
