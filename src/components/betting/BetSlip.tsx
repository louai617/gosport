"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AlertTriangle, Receipt, Trash2 } from "lucide-react";
import { BETTING_RULES, IS_DEMO } from "@/config/app.config";
import { calculateSlip, systemSizesFor } from "@/lib/betting";
import { cn } from "@/lib/cn";
import { formatAmount, formatOdds } from "@/lib/format";
import { useHydrated } from "@/lib/useHydrated";
import { useI18n } from "@/i18n/I18nProvider";
import { useBetSlipStore } from "@/store/betSlipStore";
import { newIdempotencyKey, useWallet } from "@/components/wallet/WalletProvider";
import { useToast } from "@/components/ui/Toast";
import { Button, buttonStyles } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { SimulatedBadge } from "@/components/ui/SimulatedBadge";
import { Skeleton } from "@/components/ui/Skeleton";
import { BetSlipItemRow } from "./BetSlipItemRow";
import { StakeInput } from "./StakeInput";

export interface BetSlipProps {
  /** The sheet supplies its own title bar, so the panel header is suppressed. */
  showHeader?: boolean;
  className?: string;
}

interface PlaceResponse {
  tickets: Array<{ reference: string; stake: number }>;
  balance: number;
}

export function BetSlip({ showHeader = true, className }: BetSlipProps) {
  const { t, locale } = useI18n();
  const { toast } = useToast();
  const hydrated = useHydrated();

  const items = useBetSlipStore((state) => state.items);
  const mode = useBetSlipStore((state) => state.mode);
  const sharedStake = useBetSlipStore((state) => state.sharedStake);
  const systemSize = useBetSlipStore((state) => state.systemSize);
  const lastAddedId = useBetSlipStore((state) => state.lastAddedId);

  const setMode = useBetSlipStore((state) => state.setMode);
  const setSharedStake = useBetSlipStore((state) => state.setSharedStake);
  const setItemStake = useBetSlipStore((state) => state.setItemStake);
  const setSystemSize = useBetSlipStore((state) => state.setSystemSize);
  const remove = useBetSlipStore((state) => state.remove);
  const clear = useBetSlipStore((state) => state.clear);
  const clearAfterPlacement = useBetSlipStore((state) => state.clearAfterPlacement);
  const acceptOddsChanges = useBetSlipStore((state) => state.acceptOddsChanges);

  const router = useRouter();
  const pathname = usePathname();
  const { request, applyBalance, signedIn, ready } = useWallet();
  const [placing, setPlacing] = useState(false);

  // One key per distinct slip: a double-click or a retry after a dropped
  // connection re-sends the *same* key, so the server books one ticket. Any edit
  // to the slip is a different request and gets a new key.
  const idempotencyKey = useRef<string | null>(null);

  // Selecting primitives and deriving here keeps the store from handing back a
  // fresh object on every render, which would re-render this tree forever.
  const calculation = useMemo(
    () => calculateSlip({ items, mode, sharedStake, systemSize }),
    [items, mode, sharedStake, systemSize],
  );

  useEffect(() => {
    idempotencyKey.current = null;
  }, [items, mode, sharedStake, systemSize]);

  const modes = useMemo(
    () => [
      { value: "single", label: t("betslip.mode.single") },
      {
        value: "multiple",
        label: t("betslip.mode.multiple"),
        disabled: items.length < BETTING_RULES.minSelectionsForMultiple,
      },
      {
        value: "system",
        label: t("betslip.mode.system"),
        disabled: items.length < BETTING_RULES.minSelectionsForSystem,
      },
    ],
    [items.length, t],
  );

  if (!hydrated) {
    return (
      <div className={cn("space-y-3 p-4", className)} aria-busy="true">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-11 w-full" />
      </div>
    );
  }

  const isEmpty = items.length === 0;
  const canPlace = calculation.errorKeys.length === 0 && !isEmpty;

  const handlePlace = async () => {
    if (placing || !canPlace) return;
    setPlacing(true);
    idempotencyKey.current ??= newIdempotencyKey();

    // The server prices the ticket from its own book; what is sent is *which*
    // selections, the price the player saw, and the stake — nothing else.
    const outcome = await request<PlaceResponse>("/api/bets", {
      mode,
      selections: items
        .filter((item) => !item.suspended)
        .map((item) => ({
          selectionId: item.selectionId,
          marketId: item.marketId,
          eventId: item.eventId,
          odds: item.odds,
          ...(mode === "single" ? { stake: item.stake } : {}),
        })),
      ...(mode === "single" ? {} : { stake: sharedStake }),
      ...(mode === "system" ? { systemSize } : {}),
      acceptOddsChange: acceptOddsChanges,
      idempotencyKey: idempotencyKey.current,
    });
    setPlacing(false);

    if (!outcome.ok || !outcome.data) {
      toast({
        tone: "danger",
        title: t("betslip.placeFailed"),
        description: t(outcome.errorKey ?? "error.generic"),
      });
      return;
    }

    idempotencyKey.current = null;
    applyBalance(outcome.data.balance);
    clearAfterPlacement();
    router.refresh();

    const tickets = outcome.data.tickets;
    toast({
      tone: "success",
      title: t("betslip.placed.title"),
      description: t("betslip.placed.description", {
        reference: tickets.map((ticket) => ticket.reference).join(", "),
        stake: formatAmount(
          tickets.reduce((sum, ticket) => sum + ticket.stake, 0),
          locale,
        ),
      }),
    });
  };

  return (
    <div className={cn("flex min-h-0 flex-auto flex-col", className)}>
      {showHeader ? (
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line px-4 py-3">
          <h2 className="flex items-center gap-2 text-h3 text-ink">
            <Receipt size={16} aria-hidden="true" className="text-ink-subtle" />
            {t("betslip.title")}
            {!isEmpty ? (
              <span className="numeric grid size-5 place-items-center rounded-full bg-primary text-caption font-bold text-ink-inverse">
                {items.length}
              </span>
            ) : null}
          </h2>

          {!isEmpty ? (
            <button
              type="button"
              onClick={clear}
              className="flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-1 text-caption normal-case tracking-normal text-ink-subtle transition-colors duration-fast hover:bg-surface-2 hover:text-danger"
            >
              <Trash2 size={12} aria-hidden="true" />
              {t("ui.clearAll")}
            </button>
          ) : null}
        </div>
      ) : null}

      {isEmpty ? (
        <div className="flex min-h-0 flex-auto items-center justify-center">
          <EmptyState
            size="sm"
            icon={<Receipt size={20} aria-hidden="true" />}
            title={t("betslip.empty.title")}
            description={t("betslip.empty.description")}
            action={
              <Link href="/sports" className={buttonStyles({ variant: "secondary", size: "sm" })}>
                {t("betslip.empty.browse")}
              </Link>
            }
          />
        </div>
      ) : (
        <>
          <div className="shrink-0 border-b border-line-soft px-4 py-3">
            <SegmentedControl
              options={modes}
              value={mode}
              onChange={(next) => setMode(next as typeof mode)}
              aria-label={t("betslip.mode.label")}
            />
          </div>

          <div className="scroll-slim min-h-0 flex-auto overflow-y-auto px-4 py-3">
            <ul className="space-y-2">
              {items.map((item) => (
                <BetSlipItemRow
                  key={item.selectionId}
                  item={item}
                  showStake={mode === "single"}
                  isNew={item.selectionId === lastAddedId}
                  onRemove={remove}
                  onStakeChange={setItemStake}
                />
              ))}
            </ul>

            {mode === "system" ? (
              <fieldset className="mt-4">
                <legend className="mb-2 text-small text-ink-muted">
                  {t("betslip.systemSize")}
                </legend>
                <div className="flex flex-wrap gap-1.5">
                  {systemSizesFor(items.length).map((size) => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => setSystemSize(size)}
                      aria-pressed={size === systemSize}
                      className={cn(
                        "numeric h-8 cursor-pointer rounded-md border px-3 text-small font-semibold transition-colors duration-fast",
                        size === systemSize
                          ? "border-primary bg-primary-soft text-primary"
                          : "border-line bg-surface-2 text-ink-muted hover:border-line-strong hover:text-ink",
                      )}
                    >
                      {size}/{items.length}
                    </button>
                  ))}
                </div>
              </fieldset>
            ) : null}

            <p className="mt-3 text-center text-caption normal-case tracking-normal text-ink-subtle">
              {t("betslip.authPrompt")}{" "}
              <Link
                href="/login"
                className="font-semibold text-primary underline-offset-2 hover:underline"
              >
                {t("nav.login")}
              </Link>
              {" · "}
              <Link
                href="/register"
                className="font-semibold text-primary underline-offset-2 hover:underline"
              >
                {t("nav.register")}
              </Link>
            </p>
          </div>

          <div className="shrink-0 space-y-3 border-t border-line px-4 py-3">
            {mode !== "single" ? (
              <StakeInput
                value={sharedStake}
                onChange={setSharedStake}
                label={
                  mode === "system" ? t("betslip.stakePerLine") : t("betslip.stake")
                }
              />
            ) : null}

            <dl className="space-y-1.5 text-small">
              {calculation.systemLines ? (
                <SummaryRow
                  label={t("betslip.lines")}
                  value={String(calculation.systemLines)}
                />
              ) : null}

              {calculation.combinedOdds ? (
                <SummaryRow
                  label={t("betslip.totalOdds")}
                  value={formatOdds(calculation.combinedOdds)}
                />
              ) : null}

              <SummaryRow
                label={t("betslip.totalStake")}
                value={formatAmount(calculation.totalStake, locale)}
              />

              <SummaryRow
                emphasis
                label={t("betslip.potentialReturn")}
                value={formatAmount(calculation.potentialReturn, locale)}
              />
            </dl>

            {calculation.warningKeys.map((key) => (
              <p
                key={key}
                className="flex items-start gap-1.5 text-caption normal-case tracking-normal text-warning"
              >
                <AlertTriangle size={12} aria-hidden="true" className="mt-0.5 shrink-0" />
                {t(key)}
              </p>
            ))}

            {calculation.errorKeys.map((key) => (
              <p
                key={key}
                role="alert"
                className="flex items-start gap-1.5 text-caption normal-case tracking-normal text-danger"
              >
                <AlertTriangle size={12} aria-hidden="true" className="mt-0.5 shrink-0" />
                {t(key)}
              </p>
            ))}

            {/* The whole point of the demo build: this is stated before the
                button, not buried in a footnote after it. */}
            {IS_DEMO ? (
              <p className="flex items-center justify-center gap-1.5 text-caption normal-case tracking-normal text-ink-subtle">
                <SimulatedBadge />
                {t("betslip.demoNoticeShort")}
              </p>
            ) : null}

            {ready && !signedIn ? (
              <Link
                href={`/login?next=${encodeURIComponent(pathname)}`}
                className={buttonStyles({ fullWidth: true })}
              >
                {t("betslip.signInToBet")}
              </Link>
            ) : (
              <Button fullWidth disabled={!canPlace || !ready} loading={placing} onClick={handlePlace}>
                {t("betslip.placeSimulated")}
              </Button>
            )}

          </div>
        </>
      )}
    </div>
  );
}

function SummaryRow({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={cn(emphasis ? "font-semibold text-ink" : "text-ink-muted")}>
        {label}
      </dt>
      <dd
        className={cn(
          "numeric font-semibold",
          emphasis ? "text-h3 text-primary" : "text-ink",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
