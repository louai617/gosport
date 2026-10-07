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
 * The browser's connection to the server ledger.
 *
 * One balance for the whole app: the navbar, the bet slip and every game read
 * from here, so there is no second number that can drift out of step. The value
 * is only ever what the server last returned — nothing in the client adds to or
 * subtracts from it, because a balance the client can compute is a balance the
 * client can forge.
 *
 * It also owns the CSRF token and the "POST JSON with a token" mechanics, so no
 * caller reimplements them (and none forgets the header).
 */

export interface PlayParams {
  stake?: number;
  rows?: number;
  risk?: "low" | "medium" | "high";
  bets?: Array<{ key: string; amount: number }>;
  [key: string]: unknown;
}

export interface PlayOutcome<T = unknown> {
  ok: boolean;
  errorKey?: string;
  roundId?: string;
  result?: T;
}

export interface RequestOutcome<T> {
  ok: boolean;
  status: number;
  data?: T;
  errorKey?: string;
}

interface WalletValue {
  /** `null` until the handshake completes, and for anyone who is not a signed-in player. */
  balance: number | null;
  signedIn: boolean;
  ready: boolean;
  error: string | null;
  /** Takes the balance the server just returned. The only way the figure changes. */
  applyBalance: (balance: number) => void;
  refresh: () => Promise<void>;
  /** POST JSON with CSRF. Resolves instead of throwing; `ok` says what happened. */
  request: <T>(path: string, body: Record<string, unknown>) => Promise<RequestOutcome<T>>;
  play: <T>(game: string, params: PlayParams) => Promise<PlayOutcome<T>>;
  act: <T>(game: string, roundId: string, action: string, params?: Record<string, unknown>) => Promise<PlayOutcome<T>>;
  /** The caller's open round for a game, so a reload resumes it. */
  resume: <T>(game: string, roundId?: string) => Promise<{ roundId: string; result: T; settled: boolean } | null>;
}

const WalletContext = createContext<WalletValue | null>(null);

interface Envelope<T> {
  ok: boolean;
  data?: T;
  error?: { messageKey: string };
}

export function newIdempotencyKey(): string {
  return globalThis.crypto?.randomUUID?.() ?? `k-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [balance, setBalance] = useState<number | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const csrf = useRef("");

  const bootstrap = useCallback(async () => {
    try {
      const session = (await (
        await fetch("/api/auth/session", { cache: "no-store" })
      ).json()) as Envelope<{ user: { role: string } | null; csrfToken: string }>;

      csrf.current = session.data?.csrfToken ?? "";

      if (session.data?.user?.role === "player") {
        const wallet = (await (await fetch("/api/wallet", { cache: "no-store" })).json()) as Envelope<{
          balance: number;
        }>;
        setSignedIn(true);
        setBalance(wallet.ok && wallet.data ? wallet.data.balance : null);
      } else {
        setSignedIn(false);
        setBalance(null);
      }
      setError(null);
    } catch {
      // Offline or the API is down: nothing is playable rather than falling back
      // to a local balance, which would be a fiction.
      setError("error.network");
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  const request = useCallback(
    async <T,>(path: string, body: Record<string, unknown>): Promise<RequestOutcome<T>> => {
      const send = () =>
        fetch(path, {
          method: "POST",
          headers: { "content-type": "application/json", "x-csrf-token": csrf.current },
          body: JSON.stringify(body),
        });

      try {
        let response = await send();

        // The CSRF cookie can be rotated under a long-lived tab; fetch a new
        // token once and retry before reporting a failure.
        if (response.status === 403 && !csrf.current) {
          await bootstrap();
          response = await send();
        }

        const parsed = (await response.json()) as Envelope<T>;
        if (!parsed.ok) {
          return { ok: false, status: response.status, errorKey: parsed.error?.messageKey ?? "error.generic" };
        }
        return { ok: true, status: response.status, data: parsed.data };
      } catch {
        return { ok: false, status: 0, errorKey: "error.network" };
      }
    },
    [bootstrap],
  );

  const applyBalance = useCallback((next: number) => setBalance(next), []);

  const post = useCallback(
    async <T,>(path: string, payload: Record<string, unknown>): Promise<PlayOutcome<T>> => {
      const outcome = await request<{ balance: number; roundId: string; result: T }>(path, {
        ...payload,
        idempotencyKey: newIdempotencyKey(),
      });

      if (!outcome.ok || !outcome.data) {
        const key = outcome.errorKey ?? "error.generic";
        setError(key);
        return { ok: false, errorKey: key };
      }

      // The server's figure replaces ours outright; it is the only one that
      // has been through a balance check.
      setBalance(outcome.data.balance);
      setError(null);
      return { ok: true, roundId: outcome.data.roundId, result: outcome.data.result };
    },
    [request],
  );

  const play = useCallback(
    <T,>(game: string, params: PlayParams) => post<T>("/api/casino/play", { game, ...params }),
    [post],
  );

  const act = useCallback(
    <T,>(game: string, roundId: string, action: string, params: Record<string, unknown> = {}) =>
      post<T>("/api/casino/action", { game, roundId, action, ...params }),
    [post],
  );

  const resume = useCallback(
    async <T,>(game: string, roundId?: string): Promise<{ roundId: string; result: T; settled: boolean } | null> => {
      try {
        const query = `game=${encodeURIComponent(game)}${roundId ? `&roundId=${encodeURIComponent(roundId)}` : ""}`;
        const response = await fetch(`/api/casino/active?${query}`, { cache: "no-store" });
        const body = (await response.json()) as Envelope<{
          balance: number;
          roundId: string;
          result: T;
          settled: boolean;
        } | null>;
        if (!body.ok || !body.data) return null;
        setBalance(body.data.balance);
        return { roundId: body.data.roundId, result: body.data.result, settled: body.data.settled };
      } catch {
        return null;
      }
    },
    [],
  );

  const value = useMemo<WalletValue>(
    () => ({ balance, signedIn, ready, error, applyBalance, refresh: bootstrap, request, play, act, resume }),
    [balance, signedIn, ready, error, applyBalance, bootstrap, request, play, act, resume],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletValue {
  const context = useContext(WalletContext);
  if (!context) throw new Error("useWallet must be used inside <WalletProvider>");
  return context;
}

/** Read-only balance for chrome that must not trigger a game's error state. */
export function useWalletBalance(): number | null {
  return useContext(WalletContext)?.balance ?? null;
}
