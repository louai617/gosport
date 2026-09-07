"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, Sparkles } from "lucide-react";
import {
  FREE_SPINS_AWARDED,
  FREE_SPIN_MULTIPLIER,
  LINE_COUNT,
  PAYLINES,
  PAYTABLE,
  REELS,
  REEL_COUNT,
  ROW_COUNT,
  SCATTER_PAYS,
  SLOT_HIT_FREQUENCY,
  SLOT_MAX_WIN,
  SLOT_RTP,
  SLOT_SUB_STAKE_WIN_RATE,
  evaluateGrid,
  gridFromStops,
  spinFromFloats,
  type SlotSymbol,
  type SpinResult,
} from "@/lib/games/slots";
import { cn } from "@/lib/cn";
import { formatAmount } from "@/lib/format";
import { round2 } from "@/lib/games/constants";
import { useI18n } from "@/i18n/I18nProvider";
import { useGameStore } from "@/store/gameStore";
import { Badge } from "@/components/ui/Badge";
import { SlotSymbolIcon } from "./SlotSymbolIcon";
import { StakePanel } from "./StakePanel";
import { useGameRound } from "./useGameRound";

const SPIN_MS = 520;
const REEL_STAGGER_MS = 130;
const CYCLE_MS = 60;

/** Resting reel positions, chosen to show a mix of symbols and no win. */
const IDLE_STOPS = [2, 9, 14, 5, 20];

/** Symbols shown on a reel that is still spinning. */
function blurSymbol(reel: number, row: number, tick: number): SlotSymbol {
  const strip = REELS[reel]!;
  return strip[(tick * 3 + row * 7 + reel * 5) % strip.length]!;
}

/** "reel:row" keys for every cell on a winning line, for highlighting. */
function winningCells(result: SpinResult | null): Set<string> {
  const cells = new Set<string>();
  if (!result) return cells;

  for (const win of result.lineWins) {
    const line = PAYLINES[win.line]!;
    for (let reel = 0; reel < win.count; reel += 1) {
      cells.add(`${reel}:${line[reel]}`);
    }
  }

  if (result.scatterCount >= 3) {
    result.grid.forEach((reel, reelIndex) =>
      reel.forEach((symbol, row) => {
        if (symbol === "scatter") cells.add(`${reelIndex}:${row}`);
      }),
    );
  }

  return cells;
}

export function SlotsBoard() {
  const { t, locale } = useI18n();
  const { begin, draw, settle } = useGameRound();
  const setBusy = useGameStore((state) => state.setBusy);

  const [stake, setStake] = useState(1);
  // A fixed idle grid rather than an empty one: the machine should look like a
  // machine before the first spin. Deterministic, so server and client agree.
  const [result, setResult] = useState<SpinResult | null>(() =>
    evaluateGrid(gridFromStops(IDLE_STOPS), IDLE_STOPS),
  );
  const [revealed, setRevealed] = useState(REEL_COUNT);
  const [tick, setTick] = useState(0);
  const [freeSpins, setFreeSpins] = useState(0);
  const [lastWin, setLastWin] = useState<number | null>(null);
  const [showPaytable, setShowPaytable] = useState(false);

  const timers = useRef<number[]>([]);
  const cycle = useRef<number | null>(null);

  const clearTimers = useCallback(() => {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
    if (cycle.current !== null) window.clearInterval(cycle.current);
    cycle.current = null;
  }, []);

  // A spin left running past unmount would settle into a store the player has
  // navigated away from, and leak an interval.
  useEffect(() => clearTimers, [clearTimers]);

  const spinning = revealed < REEL_COUNT;
  const isFreeSpin = freeSpins > 0;

  const spin = async () => {
    if (spinning) return;

    // Free spins are already paid for; only a paid spin touches the balance.
    let round = null;
    if (!isFreeSpin) {
      round = begin(stake);
      if (!round) return;
    } else {
      const state = useGameStore.getState();
      round = {
        serverSeed: state.serverSeed,
        serverSeedHash: state.serverSeedHash,
        clientSeed: state.clientSeed,
        nonce: useGameStore.getState().consumeNonce(),
      };
    }

    setBusy(true);
    setLastWin(null);
    setResult(null);

    const floats = await draw(round, REEL_COUNT);
    const outcome = spinFromFloats(floats);

    // The outcome is decided here, before a single reel moves. Everything below
    // is presentation replaying a settled result.
    setResult(outcome);
    setRevealed(0);
    cycle.current = window.setInterval(() => setTick((value) => value + 1), CYCLE_MS);

    for (let reel = 1; reel <= REEL_COUNT; reel += 1) {
      timers.current.push(
        window.setTimeout(() => setRevealed(reel), SPIN_MS + reel * REEL_STAGGER_MS),
      );
    }

    timers.current.push(
      window.setTimeout(
        () => {
          clearTimers();

          const multiplier = outcome.totalMultiplier * (isFreeSpin ? FREE_SPIN_MULTIPLIER : 1);
          const payout = round2(stake * multiplier);
          setLastWin(payout);

          settle({
            gameKey: "slots",
            stake: isFreeSpin ? 0 : stake,
            multiplier,
            result: outcome.stops[0] ?? 0,
            outcome: multiplier > 0 ? "won" : "lost",
            round,
          });

          setFreeSpins((remaining) => {
            const afterSpend = isFreeSpin ? remaining - 1 : remaining;
            // Retriggers are not awarded during free spins — the published RTP
            // is computed on that basis, so allowing them here would make the
            // stated figure wrong.
            return isFreeSpin ? afterSpend : afterSpend + outcome.freeSpinsAwarded;
          });

          setBusy(false);
        },
        SPIN_MS + REEL_COUNT * REEL_STAGGER_MS + 60,
      ),
    );
  };

  const highlights = revealed === REEL_COUNT ? winningCells(result) : new Set<string>();
  const won = lastWin !== null && lastWin > 0;

  return (
    <>
      <section className="rounded-xl border border-line bg-surface p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <span className="text-caption uppercase text-ink-subtle">
            {t("games.slots.lines", { count: LINE_COUNT })}
          </span>
          {isFreeSpin ? (
            <Badge tone="warning" dot>
              {t("games.slots.freeSpinsLeft", { count: freeSpins })}
            </Badge>
          ) : null}
        </div>

        {/* The reels. `grid` rather than five absolutely-positioned columns so
            the cells stay in the document flow and scale with the container. */}
        <div
          role="img"
          aria-label={t("games.slots.reelsLabel")}
          className="grid grid-cols-5 gap-1.5 rounded-lg border border-line-soft bg-canvas-soft p-2 sm:gap-2 sm:p-3"
        >
          {Array.from({ length: REEL_COUNT }, (_, reel) =>
            Array.from({ length: ROW_COUNT }, (_, row) => {
              const settled = revealed > reel;
              const symbol = settled
                ? (result?.grid[reel]?.[row] ?? "whistle")
                : blurSymbol(reel, row, tick);
              const isWin = settled && highlights.has(`${reel}:${row}`);

              return (
                <div
                  key={`${reel}-${row}`}
                  style={{ gridColumn: reel + 1, gridRow: row + 1 }}
                  className={cn(
                    "grid aspect-square place-items-center rounded-md border transition-colors duration-base",
                    isWin
                      ? "border-primary bg-primary-soft"
                      : "border-line-soft bg-surface-2",
                    !settled && "opacity-70",
                  )}
                >
                  <SlotSymbolIcon
                    symbol={symbol}
                    size={26}
                    className={cn(!settled && "blur-[1.5px]", isWin && "animate-pop")}
                  />
                </div>
              );
            }),
          )}
        </div>

        <div className="mt-3 flex min-h-9 items-center justify-center" aria-live="polite">
          {spinning ? (
            <p className="text-small text-ink-subtle">{t("games.slots.spinning")}</p>
          ) : won ? (
            <p className="numeric flex items-center gap-2 text-h3 font-bold text-success animate-pop">
              <Sparkles size={17} aria-hidden="true" />
              {t("games.slots.win", { amount: formatAmount(lastWin, locale) })}
            </p>
          ) : lastWin !== null ? (
            <p className="text-small text-ink-subtle">{t("games.slots.noWin")}</p>
          ) : (
            <p className="text-small text-ink-subtle">{t("games.slots.prompt")}</p>
          )}
        </div>

        {/* ---------------------------------------------------- paytable ---- */}
        <div className="mt-3 border-t border-line-soft pt-3">
          <button
            type="button"
            onClick={() => setShowPaytable(!showPaytable)}
            aria-expanded={showPaytable}
            className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-md py-1 text-small text-ink-muted transition-colors duration-fast hover:text-ink"
          >
            {t("games.slots.paytable")}
            <ChevronDown
              size={15}
              aria-hidden="true"
              className={cn("transition-transform duration-base", showPaytable && "rotate-180")}
            />
          </button>

          {showPaytable ? (
            <div className="mt-3 space-y-3">
              <ul className="grid gap-1.5 sm:grid-cols-2">
                {(Object.keys(PAYTABLE) as SlotSymbol[])
                  .filter((symbol) => symbol !== "scatter")
                  .map((symbol) => (
                    <li
                      key={symbol}
                      className="flex items-center gap-2.5 rounded-md bg-surface-2 px-2.5 py-1.5"
                    >
                      <SlotSymbolIcon symbol={symbol} size={20} />
                      <span className="flex-1 truncate text-caption normal-case tracking-normal text-ink-muted">
                        {t(`games.slots.symbol.${symbol}`)}
                      </span>
                      <span className="numeric text-caption text-ink">
                        {PAYTABLE[symbol]
                          .map((value) => (value === 0 ? "—" : value))
                          .join(" / ")}
                      </span>
                    </li>
                  ))}
              </ul>

              <p className="text-caption normal-case leading-relaxed tracking-normal text-ink-subtle">
                {t("games.slots.paytableNote", {
                  scatter3: SCATTER_PAYS[3] ?? 0,
                  scatter5: SCATTER_PAYS[5] ?? 0,
                  spins: FREE_SPINS_AWARDED,
                  multiplier: FREE_SPIN_MULTIPLIER,
                })}
              </p>

              {/* The numbers a slot normally does not show you. Every one of
                  these is enumerated in scripts/slot-rtp.ts, not estimated. */}
              <dl className="grid grid-cols-2 gap-2 rounded-md border border-line-soft bg-surface-2/60 p-3 text-caption normal-case tracking-normal">
                {[
                  { label: t("games.slots.stat.rtp"), value: `${(SLOT_RTP * 100).toFixed(2)}%` },
                  { label: t("games.slots.stat.hitRate"), value: `${(SLOT_HIT_FREQUENCY * 100).toFixed(1)}%` },
                  { label: t("games.slots.stat.subStake"), value: `${(SLOT_SUB_STAKE_WIN_RATE * 100).toFixed(1)}%` },
                  { label: t("games.slots.stat.maxWin"), value: `${SLOT_MAX_WIN}×` },
                ].map((row) => (
                  <div key={row.label}>
                    <dt className="text-ink-subtle">{row.label}</dt>
                    <dd className="numeric mt-0.5 font-semibold text-ink">{row.value}</dd>
                  </div>
                ))}
              </dl>

              <p className="text-caption normal-case leading-relaxed tracking-normal text-ink-subtle">
                {t("games.slots.honestyNote")}
              </p>
            </div>
          ) : null}
        </div>
      </section>

      <StakePanel
        stake={stake}
        onStakeChange={setStake}
        onBet={spin}
        busy={spinning}
        betLabel={isFreeSpin ? t("games.slots.freeSpin") : t("games.slots.spin")}
        summary={[
          {
            label: t("games.slots.lineBet"),
            value: formatAmount(round2(stake / LINE_COUNT), locale),
          },
          { label: t("games.slots.maxWinLabel"), value: `${SLOT_MAX_WIN}×` },
        ]}
      />
    </>
  );
}
