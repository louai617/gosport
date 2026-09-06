"use client";

import { useState } from "react";
import { CircleCheck, CircleX, ShieldCheck } from "lucide-react";
import type { GameKey } from "@/types/games";
import { generateFloats, sha256Hex, shuffleIndices } from "@/lib/provablyFair";
import { settleDice } from "@/lib/games/dice";
import { multiplierFromFloat } from "@/lib/games/limbo";
import { minePositions } from "@/lib/games/mines";
import { dropPlinko } from "@/lib/games/plinko";
import { TILE_COUNT } from "@/lib/games/mines";
import { cn } from "@/lib/cn";
import { useT } from "@/i18n/I18nProvider";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useGameStore } from "@/store/gameStore";

type VerifiableGame = Extract<GameKey, "dice" | "limbo" | "crash" | "mines" | "plinko">;

const GAMES: VerifiableGame[] = ["dice", "limbo", "crash", "mines", "plinko"];

interface Verification {
  commitmentMatches: boolean | null;
  computedHash: string;
  floats: number[];
  summary: string;
}

/**
 * Independent verifier.
 *
 * Runs the same functions the games run, on inputs the player pastes in. It
 * has no privileged access to anything — which is the point: if this page can
 * reproduce a result, so can any third party with the same four values.
 */
export function FairnessVerifier() {
  const t = useT();

  const previousPair = useGameStore((state) => state.previousPair);
  const [serverSeed, setServerSeed] = useState("");
  const [clientSeed, setClientSeed] = useState("");
  const [nonce, setNonce] = useState("0");
  const [expectedHash, setExpectedHash] = useState("");
  const [game, setGame] = useState<VerifiableGame>("dice");
  const [result, setResult] = useState<Verification | null>(null);
  const [pending, setPending] = useState(false);

  const prefill = () => {
    if (!previousPair) return;
    setServerSeed(previousPair.serverSeed);
    setClientSeed(previousPair.clientSeed);
    setExpectedHash(previousPair.serverSeedHash);
    setNonce("0");
  };

  const verify = async () => {
    if (!serverSeed || !clientSeed) return;
    setPending(true);

    const input = { serverSeed, clientSeed, nonce: Number(nonce) || 0 };
    const computedHash = await sha256Hex(serverSeed);
    const commitmentMatches = expectedHash
      ? computedHash === expectedHash.trim().toLowerCase()
      : null;

    let floats: number[] = [];
    let summary = "";

    if (game === "dice") {
      floats = await generateFloats(input, 1);
      const roll = settleDice(floats[0] ?? 0, 50, "under");
      summary = t("games.verify.diceResult", { roll: roll.roll.toFixed(2) });
    } else if (game === "limbo" || game === "crash") {
      floats = await generateFloats(input, 1);
      const multiplier = multiplierFromFloat(floats[0] ?? 0);
      summary = t(
        game === "crash" ? "games.verify.crashResult" : "games.verify.limboResult",
        { multiplier: multiplier.toFixed(2) },
      );
    } else if (game === "mines") {
      const shuffled = await shuffleIndices(input, TILE_COUNT);
      floats = await generateFloats(input, 6);
      const positions = [...minePositions(shuffled, 3)].sort((a, b) => a - b);
      summary = t("games.verify.minesResult", {
        tiles: positions.map((index) => index + 1).join(", "),
      });
    } else {
      floats = await generateFloats(input, 12);
      const dropped = dropPlinko(floats, 12, "medium");
      summary = t("games.verify.plinkoResult", {
        bucket: dropped.bucket + 1,
        multiplier: dropped.multiplier.toFixed(2),
      });
    }

    setResult({ commitmentMatches, computedHash, floats: floats.slice(0, 4), summary });
    setPending(false);
  };

  return (
    <div className="space-y-5">
      {previousPair ? (
        <Alert tone="info" title={t("games.verify.prefillTitle")}>
          <span className="flex flex-wrap items-center gap-3">
            {t("games.verify.prefillBody")}
            <Button size="sm" variant="secondary" onClick={prefill}>
              {t("games.verify.prefillCta")}
            </Button>
          </span>
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label={t("games.fair.serverSeed")}
          value={serverSeed}
          onChange={(event) => setServerSeed(event.target.value.trim())}
          hint={t("games.verify.serverSeedHint")}
        />
        <Input
          label={t("games.fair.clientSeed")}
          value={clientSeed}
          onChange={(event) => setClientSeed(event.target.value.trim())}
        />
        <Input
          label={t("games.fair.nonce")}
          inputMode="numeric"
          value={nonce}
          onChange={(event) => setNonce(event.target.value.replace(/\D/g, ""))}
        />
        <Select
          label={t("games.verify.game")}
          value={game}
          onChange={(event) => setGame(event.target.value as VerifiableGame)}
          options={GAMES.map((key) => ({ value: key, label: t(`games.title.${key}`) }))}
        />
        <div className="sm:col-span-2">
          <Input
            label={t("games.fair.serverSeedHash")}
            value={expectedHash}
            onChange={(event) => setExpectedHash(event.target.value.trim())}
            hint={t("games.verify.hashHint")}
          />
        </div>
      </div>

      <Button
        size="lg"
        loading={pending}
        disabled={!serverSeed || !clientSeed}
        onClick={verify}
        iconStart={<ShieldCheck size={16} />}
      >
        {t("games.verify.run")}
      </Button>

      {result ? (
        <section className="space-y-3 rounded-xl border border-line bg-surface p-4">
          {result.commitmentMatches !== null ? (
            <p
              className={cn(
                "flex items-start gap-2 text-small font-semibold",
                result.commitmentMatches ? "text-success" : "text-danger",
              )}
            >
              {result.commitmentMatches ? (
                <CircleCheck size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
              ) : (
                <CircleX size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
              )}
              {result.commitmentMatches
                ? t("games.verify.commitmentOk")
                : t("games.verify.commitmentFailed")}
            </p>
          ) : null}

          <div>
            <p className="text-caption uppercase text-ink-subtle">
              {t("games.verify.computedHash")}
            </p>
            <code
              dir="ltr"
              className="numeric mt-1 block break-all rounded-md border border-line bg-surface-2 px-2.5 py-2 text-caption normal-case tracking-normal text-ink-muted"
            >
              {result.computedHash}
            </code>
          </div>

          <div>
            <p className="text-caption uppercase text-ink-subtle">
              {t("games.verify.floats")}
            </p>
            <code
              dir="ltr"
              className="numeric mt-1 block break-all rounded-md border border-line bg-surface-2 px-2.5 py-2 text-caption normal-case tracking-normal text-ink-muted"
            >
              {result.floats.map((value) => value.toFixed(8)).join("  ")}
            </code>
          </div>

          <p className="rounded-md border border-primary/25 bg-primary-soft/40 px-3 py-2.5 text-small text-ink">
            {result.summary}
          </p>
        </section>
      ) : null}
    </div>
  );
}
