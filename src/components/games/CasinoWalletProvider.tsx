"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

/**
 * The casino's connection to the server ledger.
 *
 * One balance for the whole app: the games and the navbar read from here, so
 * there is no second number that can drift out of step. The value is only ever
 * what the server last returned — nothing in the client adds to or subtracts
 * from it, because a balance the client can compute is a balance the client
 * can forge.
 */

export interface PlayParams {
  stake?: number;
  rows?: number;
  risk?: "low" | "medium" | "high";
  bets?: Array<{ key: string; amount: number }>;
}

export interface PlayOutcome<T = unknown> {
  ok: boolean;
  errorKey?: string;
  roundId?: string;
  result?: T;
}

interface CasinoWalletValue {
  /** `null` until the session handshake completes. */
  balance: number | null;
  ready: boolean;
  error: string | null;
  play: <T>(game: string, params: PlayParams) => Promise<PlayOutcome<T>>;
  act: <T>(roundId: string, action: string) => Promise<PlayOutcome<T>>;
  refresh: () => Promise<void>;
}

const CasinoWalletContext = createContext<CasinoWalletValue | null>(null);

interface Envelope<T> {
  ok: boolean;
  data?: T;
  error?: { messageKey: string };
}

function newIdempotencyKey(): string {
  return globalThis.crypto?.randomUUID?.() ?? `k-${Date.now()}-${Math.random()}`;
}

export function CasinoWalletProvider({ children }: { children: React.ReactNode }) {
  const [balance, setBalance] = useState<number | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const csrf = useRef<string>("");

  const openSession = useCallback(async () => {
    try {
      const response = await fetch("/api/casino/session", { cache: "no-store" });
      const body = (await response.json()) as Envelope<{
        balance: number;
        csrfToken: string;
      }>;

      if (!body.ok || !body.data) {
        setError(body.error?.messageKey ?? "error.generic");
        return;
      }

      csrf.current = body.data.csrfToken;
      setBalance(body.data.balance);
      setError(null);
    } catch {
      // Offline or the route is down: the games stay disabled rather than
      // falling back to a local balance, which would be a fiction.
      setError("error.network");
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void openSession();
  }, [openSession]);

  const post = useCallback(
    async <T,>(path: string, payload: Record<string, unknown>): Promise<PlayOutcome<T>> => {
      try {
        const response = await fetch(path, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-csrf-token": csrf.current,
          },
          body: JSON.stringify({ ...payload, idempotencyKey: newIdempotencyKey() }),
        });

        const body = (await response.json()) as Envelope<{
          balance: number;
          roundId: string;
          result: T;
        }>;

        if (!body.ok || !body.data) {
          const key = body.error?.messageKey ?? "error.generic";
          setError(key);
          return { ok: false, errorKey: key };
        }

        // The server's figure replaces ours outright; it is the only one that
        // has been through a balance check.
        setBalance(body.data.balance);
        setError(null);
        return { ok: true, roundId: body.data.roundId, result: body.data.result };
      } catch {
        setError("error.network");
        return { ok: false, errorKey: "error.network" };
      }
    },
    [],
  );

  const play = useCallback(
    <T,>(game: string, params: PlayParams) =>
      post<T>("/api/casino/play", { game, ...params }),
    [post],
  );

  const act = useCallback(
    <T,>(roundId: string, action: string) =>
      post<T>("/api/casino/action", { roundId, action }),
    [post],
  );

  const value = useMemo<CasinoWalletValue>(
    () => ({ balance, ready, error, play, act, refresh: openSession }),
    [balance, ready, error, play, act, openSession],
  );

  return (
    <CasinoWalletContext.Provider value={value}>{children}</CasinoWalletContext.Provider>
  );
}

export function useCasinoWallet(): CasinoWalletValue {
  const context = useContext(CasinoWalletContext);
  if (!context) {
    throw new Error("useCasinoWallet must be used inside <CasinoWalletProvider>");
  }
  return context;
}

/** Read-only balance for chrome that must not trigger the games' error state. */
export function useCasinoBalance(): number | null {
  return useContext(CasinoWalletContext)?.balance ?? null;
}
