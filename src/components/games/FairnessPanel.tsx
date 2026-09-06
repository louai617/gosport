"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Copy, RefreshCw, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/cn";
import { useCasinoReady } from "./useCasinoReady";
import { useT } from "@/i18n/I18nProvider";
import { useGameStore } from "@/store/gameStore";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";

/**
 * The commitment the player holds.
 *
 * Shows the current server-seed hash (the commitment), their editable client
 * seed and the nonce, plus the previous pair's revealed seed once rotated.
 *
 * The warning at the bottom is not boilerplate: in this build the seed is
 * generated in the browser, so the scheme's arithmetic is real but its
 * guarantee is not. Presenting the badge without that caveat would be the
 * exact misrepresentation the badge is supposed to prevent.
 */
export function FairnessPanel() {
  const t = useT();
  const ready = useCasinoReady();

  const serverSeedHash = useGameStore((state) => state.serverSeedHash);
  const clientSeed = useGameStore((state) => state.clientSeed);
  const nonce = useGameStore((state) => state.nonce);
  const previousPair = useGameStore((state) => state.previousPair);
  const rotateSeeds = useGameStore((state) => state.rotateSeeds);

  const [draft, setDraft] = useState("");
  const [rotating, setRotating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (clientSeed && !draft) setDraft(clientSeed);
  }, [clientSeed, draft]);

  const copy = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      // Clipboard access is denied in some embedded contexts; the value is
      // selectable on screen either way, so this is not worth an error state.
    }
  };

  const rotate = async () => {
    setRotating(true);
    await rotateSeeds(draft);
    setRotating(false);
  };

  if (!ready) {
    return (
      <section className="rounded-xl border border-line bg-surface p-4">
        <Skeleton className="h-4 w-32" rounded="sm" />
        <Skeleton className="mt-3 h-9 w-full" />
        <Skeleton className="mt-2 h-9 w-full" />
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <h2 className="flex items-center gap-2 text-caption uppercase text-ink-subtle">
        <ShieldCheck size={13} aria-hidden="true" className="text-success" />
        {t("games.provablyFair.title")}
      </h2>

      <div className="mt-3 space-y-3">
        <SeedField
          label={t("games.fair.serverSeedHash")}
          value={serverSeedHash}
          hint={t("games.fair.serverSeedHashHint")}
          copied={copied === "hash"}
          onCopy={() => copy("hash", serverSeedHash)}
          copyLabel={t("ui.copy")}
        />

        <div>
          <label
            htmlFor="client-seed"
            className="mb-1.5 block text-caption uppercase text-ink-subtle"
          >
            {t("games.fair.clientSeed")}
          </label>
          <input
            id="client-seed"
            value={draft}
            onChange={(event) => setDraft(event.target.value.slice(0, 64))}
            className="numeric h-9 w-full rounded-md border border-line bg-surface-2 px-2.5 text-caption normal-case tracking-normal text-ink transition-colors duration-fast hover:border-line-strong focus:border-primary"
          />
        </div>

        <div className="flex items-baseline justify-between gap-2">
          <span className="text-caption uppercase text-ink-subtle">
            {t("games.fair.nonce")}
          </span>
          <span className="numeric text-small font-semibold text-ink">{nonce}</span>
        </div>

        <Button
          variant="secondary"
          size="sm"
          fullWidth
          loading={rotating}
          onClick={rotate}
          iconStart={<RefreshCw size={14} />}
        >
          {t("games.fair.rotate")}
        </Button>
      </div>

      {previousPair ? (
        <div className="mt-4 space-y-3 border-t border-line-soft pt-3">
          <p className="text-caption uppercase text-ink-subtle">
            {t("games.fair.revealed")}
          </p>
          <SeedField
            label={t("games.fair.serverSeed")}
            value={previousPair.serverSeed}
            copied={copied === "revealed"}
            onCopy={() => copy("revealed", previousPair.serverSeed)}
            copyLabel={t("ui.copy")}
          />
          <p className="text-caption normal-case leading-relaxed tracking-normal text-ink-subtle">
            {t("games.fair.revealedHint", { count: previousPair.nonce })}
          </p>
          <Link
            href="/games/fairness"
            className="block text-caption font-semibold normal-case tracking-normal text-primary underline-offset-2 hover:underline"
          >
            {t("games.fair.verifyCta")}
          </Link>
        </div>
      ) : null}

      <Alert tone="warning" className="mt-4">
        <span className="text-caption normal-case leading-relaxed tracking-normal">
          {t("games.fair.demoCaveat")}
        </span>
      </Alert>
    </section>
  );
}

function SeedField({
  label,
  value,
  hint,
  copied,
  onCopy,
  copyLabel,
}: {
  label: string;
  value: string;
  hint?: string;
  copied: boolean;
  onCopy: () => void;
  copyLabel: string;
}) {
  return (
    <div>
      <p className="mb-1.5 text-caption uppercase text-ink-subtle">{label}</p>
      <div className="flex items-center gap-1.5">
        <code
          dir="ltr"
          className="numeric min-w-0 flex-1 truncate rounded-md border border-line bg-surface-2 px-2.5 py-2 text-caption normal-case tracking-normal text-ink-muted"
        >
          {value}
        </code>
        <button
          type="button"
          onClick={onCopy}
          aria-label={copyLabel}
          className={cn(
            "grid size-9 shrink-0 cursor-pointer place-items-center rounded-md border border-line bg-surface-2 transition-colors duration-fast hover:border-line-strong",
            copied ? "text-success" : "text-ink-subtle hover:text-ink",
          )}
        >
          {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
        </button>
      </div>
      {hint ? (
        <p className="mt-1.5 text-caption normal-case leading-relaxed tracking-normal text-ink-subtle">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
