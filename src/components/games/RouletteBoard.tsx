"use client";

import { useMemo, useState } from "react";
import { RotateCcw, Trash2 } from "lucide-react";
import {
  RED_NUMBERS,
  WHEEL_ORDER,
  colourOf,
  type BetKey,
  type RouletteOutcome,
} from "@/lib/games/roulette";
import { cn } from "@/lib/cn";
import { formatAmount } from "@/lib/format";
import { round2 } from "@/lib/games/constants";
import { useI18n } from "@/i18n/I18nProvider";
import { Button } from "@/components/ui/Button";
import { useWallet } from "@/components/wallet/WalletProvider";

const CHIPS = [1, 5, 25, 100] as const;

/** Table column order: 3,6,9… on the top row, as on a real layout. */
const ROWS = [3, 2, 1];
const COLUMNS = Array.from({ length: 12 }, (_, index) => index);

const OUTSIDE: Array<{ key: BetKey; labelKey: string; span: string }> = [
  { key: "d1", labelKey: "games.roulette.dozen1", span: "col-span-4" },
  { key: "d2", labelKey: "games.roulette.dozen2", span: "col-span-4" },
  { key: "d3", labelKey: "games.roulette.dozen3", span: "col-span-4" },
];

const EVENS: Array<{ key: BetKey; labelKey: string }> = [
  { key: "low", labelKey: "games.roulette.low" },
  { key: "even", labelKey: "games.roulette.even" },
  { key: "red", labelKey: "games.roulette.red" },
  { key: "black", labelKey: "games.roulette.black" },
  { key: "odd", labelKey: "games.roulette.odd" },
  { key: "high", labelKey: "games.roulette.high" },
];

const SPIN_MS = 2600;

export function RouletteBoard() {
  const { t, locale } = useI18n();
  const { balance, ready, play } = useWallet();

  const [chip, setChip] = useState<number>(5);
  const [bets, setBets] = useState<Record<string, number>>({});
  const [spinning, setSpinning] = useState(false);
  const [outcome, setOutcome] = useState<RouletteOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);

  const total = useMemo(
    () => round2(Object.values(bets).reduce((sum, value) => sum + value, 0)),
    [bets],
  );

  const addBet = (key: BetKey) => {
    if (spinning) return;
    setOutcome(null);
    setBets((current) => ({ ...current, [key]: round2((current[key] ?? 0) + chip) }));
  };

  const clearBets = () => {
    if (spinning) return;
    setBets({});
    setOutcome(null);
  };

  const spin = async () => {
    if (spinning || total <= 0) return;

    setSpinning(true);
    setError(null);
    setOutcome(null);

    const entries = Object.entries(bets).map(([key, amount]) => ({ key, amount }));
    const response = await play<RouletteOutcome>("roulette", { bets: entries });

    if (!response.ok || !response.result) {
      setError(response.errorKey ?? "error.generic");
      setSpinning(false);
      return;
    }

    // The pocket is already decided; the wheel animation is only catching up.
    const settled = response.result;
    window.setTimeout(() => {
      setOutcome(settled);
      setSpinning(false);
      setBets({});
    }, SPIN_MS);
  };

  const cellBet = (key: BetKey) => bets[key] ?? 0;
  const disabled = !ready || spinning;

  return (
    <>
      <section className="rounded-xl border border-line bg-surface p-4 sm:p-5">
        {/* ---------------------------------------------------- the wheel -- */}
        <div className="mb-4 flex items-center justify-center gap-4">
          <div
            className={cn(
              "grid size-24 place-items-center rounded-full border-4 transition-transform",
              outcome
                ? outcome.colour === "red"
                  ? "border-danger bg-danger-soft"
                  : outcome.colour === "green"
                    ? "border-success bg-success-soft"
                    : "border-line-strong bg-surface-3"
                : "border-line-strong bg-surface-2",
              spinning && "animate-spin",
            )}
            style={spinning ? { animationDuration: "0.7s" } : undefined}
          >
            {spinning ? (
              <RotateCcw size={22} aria-hidden="true" className="text-ink-subtle" />
            ) : outcome ? (
              <span dir="ltr" className="numeric text-h1 font-bold text-ink">
                {outcome.pocket}
              </span>
            ) : (
              <span className="text-caption uppercase text-ink-subtle">
                {t("games.roulette.ready")}
              </span>
            )}
          </div>

          <div className="min-w-0" aria-live="polite">
            {spinning ? (
              <p className="text-small text-ink-subtle">{t("games.roulette.spinning")}</p>
            ) : outcome ? (
              <>
                <p className="text-small font-semibold text-ink">
                  {t(`games.roulette.${outcome.colour}`)} · {outcome.pocket}
                </p>
                <p
                  className={cn(
                    "numeric mt-0.5 text-h3 font-bold",
                    outcome.totalReturn > 0 ? "text-success" : "text-ink-muted",
                  )}
                >
                  {outcome.totalReturn > 0
                    ? `+${formatAmount(round2(outcome.totalReturn - outcome.totalStake), locale)}`
                    : formatAmount(-outcome.totalStake, locale)}
                </p>
              </>
            ) : (
              <p className="text-small text-ink-subtle">{t("games.roulette.prompt")}</p>
            )}
          </div>
        </div>

        {/* The table is a physical layout, so it keeps its own direction. */}
        <div dir="ltr" className="scroll-slim -mx-1 overflow-x-auto px-1 pb-1">
          <div className="min-w-[520px]">
            <div className="flex gap-1">
              <TableCell
                label="0"
                tone="green"
                amount={cellBet("n0")}
                onClick={() => addBet("n0")}
                disabled={disabled}
                className="h-[108px] w-9 shrink-0"
              />

              <div className="grid flex-1 grid-cols-12 gap-1">
                {ROWS.map((offset) =>
                  COLUMNS.map((column) => {
                    const pocket = column * 3 + offset;
                    const key = `n${pocket}` as BetKey;
                    return (
                      <TableCell
                        key={pocket}
                        label={String(pocket)}
                        tone={colourOf(pocket)}
                        amount={cellBet(key)}
                        onClick={() => addBet(key)}
                        disabled={disabled}
                        highlight={outcome?.pocket === pocket}
                      />
                    );
                  }),
                )}
              </div>

              <div className="grid w-10 shrink-0 grid-rows-3 gap-1">
                {(["c3", "c2", "c1"] as BetKey[]).map((key) => (
                  <TableCell
                    key={key}
                    label="2:1"
                    tone="neutral"
                    amount={cellBet(key)}
                    onClick={() => addBet(key)}
                    disabled={disabled}
                  />
                ))}
              </div>
            </div>

            <div className="mt-1 grid grid-cols-12 gap-1 pe-11 ps-10">
              {OUTSIDE.map((entry) => (
                <TableCell
                  key={entry.key}
                  label={t(entry.labelKey)}
                  tone="neutral"
                  amount={cellBet(entry.key)}
                  onClick={() => addBet(entry.key)}
                  disabled={disabled}
                  className={entry.span}
                />
              ))}
            </div>

            <div className="mt-1 grid grid-cols-6 gap-1 pe-11 ps-10">
              {EVENS.map((entry) => (
                <TableCell
                  key={entry.key}
                  label={t(entry.labelKey)}
                  tone={
                    entry.key === "red" ? "red" : entry.key === "black" ? "black" : "neutral"
                  }
                  amount={cellBet(entry.key)}
                  onClick={() => addBet(entry.key)}
                  disabled={disabled}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------- controls -- */}
      <section className="rounded-xl border border-line bg-surface p-4">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-caption uppercase text-ink-subtle">
            {t("games.sessionBalance")}
          </h2>
          <p className="numeric text-h3 font-bold text-ink">
            {balance === null ? "—" : formatAmount(balance, locale)}
          </p>
        </div>

        <fieldset className="mt-4">
          <legend className="mb-2 text-small text-ink-muted">
            {t("games.roulette.chip")}
          </legend>
          <div className="flex gap-1.5">
            {CHIPS.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setChip(value)}
                aria-pressed={chip === value}
                className={cn(
                  "numeric h-10 flex-1 cursor-pointer rounded-full border-2 text-small font-bold transition-colors duration-fast",
                  chip === value
                    ? "border-primary bg-primary-soft text-primary"
                    : "border-line bg-surface-2 text-ink-muted hover:border-line-strong hover:text-ink",
                )}
              >
                {value}
              </button>
            ))}
          </div>
        </fieldset>

        <dl className="mt-4 space-y-1.5 border-t border-line-soft pt-3 text-small">
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-ink-muted">{t("games.roulette.totalBet")}</dt>
            <dd className="numeric font-semibold text-ink">{formatAmount(total, locale)}</dd>
          </div>
        </dl>

        {error ? (
          <p role="alert" className="mt-3 text-caption normal-case tracking-normal text-danger">
            {t(error)}
          </p>
        ) : null}

        <div className="mt-4 flex gap-2">
          <Button
            variant="secondary"
            onClick={clearBets}
            disabled={disabled || total === 0}
            iconStart={<Trash2 size={15} />}
          >
            {t("ui.clearAll")}
          </Button>
          <Button
            size="lg"
            // Grows into the space the clear button leaves rather than claiming
            // the whole row — `w-full` beside a sibling overflowed the panel.
            className="min-w-0 flex-1 shrink"
            loading={spinning || !ready}
            disabled={disabled || total <= 0}
            onClick={spin}
          >
            {t("games.roulette.spin")}
          </Button>
        </div>

        <p className="mt-3 text-caption normal-case leading-relaxed tracking-normal text-ink-subtle">
          {t("games.roulette.edgeNote")}
        </p>
      </section>
    </>
  );
}

function TableCell({
  label,
  tone,
  amount,
  onClick,
  disabled,
  highlight,
  className,
}: {
  label: string;
  tone: "red" | "black" | "green" | "neutral";
  amount: number;
  onClick: () => void;
  disabled: boolean;
  highlight?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={cn(
        "relative grid h-8 min-w-0 cursor-pointer place-items-center rounded-sm border text-caption font-semibold transition-colors duration-fast disabled:cursor-not-allowed",
        tone === "red" && "border-danger/40 bg-danger-soft text-danger",
        tone === "black" && "border-line-strong bg-surface-3 text-ink",
        tone === "green" && "border-success/40 bg-success-soft text-success",
        tone === "neutral" && "border-line bg-surface-2 text-ink-muted",
        highlight && "ring-2 ring-primary",
        !disabled && "hover:border-primary",
        className,
      )}
    >
      <span className="truncate px-0.5">{label}</span>
      {amount > 0 ? (
        <span className="numeric absolute -end-1 -top-1 grid size-4 place-items-center rounded-full bg-primary text-[9px] font-bold text-ink-inverse">
          {amount >= 100 ? "99+" : amount}
        </span>
      ) : null}
    </button>
  );
}

/** Exposed for the fairness copy: the wheel's 37th pocket is the whole edge. */
export { WHEEL_ORDER, RED_NUMBERS };
