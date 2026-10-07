"use client";

import { useCallback, useEffect, useState } from "react";
import { useWallet } from "@/components/wallet/WalletProvider";

export interface FairnessState {
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  previous: Array<{
    serverSeed: string;
    serverSeedHash: string;
    clientSeed: string;
    rounds: number;
    revealedAt: string;
  }>;
}

/**
 * The player's seed commitment, read from the server. The live server seed is
 * never in this payload — only its SHA-256 — so there is nothing here the
 * browser could use to predict a round.
 */
export function useFairness() {
  const { ready, signedIn, balance, request } = useWallet();
  const [state, setState] = useState<FairnessState | null>(null);
  const [rotating, setRotating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/casino/fairness", { cache: "no-store" });
      const body = (await response.json()) as { ok: boolean; data?: FairnessState };
      if (body.ok && body.data) setState(body.data);
    } catch {
      /* the panel simply stays in its loading state */
    }
  }, []);

  // Re-read when the balance changes: that is when a round has been played and
  // the nonce has moved.
  useEffect(() => {
    if (ready && signedIn) void load();
  }, [ready, signedIn, balance, load]);

  const rotate = useCallback(
    async (clientSeed?: string) => {
      setRotating(true);
      setError(null);
      const outcome = await request<FairnessState>("/api/casino/fairness", clientSeed ? { clientSeed } : {});
      setRotating(false);
      if (outcome.ok && outcome.data) setState(outcome.data);
      else setError(outcome.errorKey ?? "error.generic");
    },
    [request],
  );

  return { state, rotate, rotating, error, signedIn, ready };
}
