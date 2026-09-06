"use client";

import { useEffect } from "react";
import { useHydrated } from "@/lib/useHydrated";
import { useGameStore } from "@/store/gameStore";

/**
 * Whether a bet can actually be placed yet.
 *
 * Two things must be true: React has hydrated (so a click reaches a handler at
 * all), and the seed pair exists (so `begin()` has something to draw from).
 * Between first paint and that point the markup is fully rendered and every
 * control *looks* live — a player clicking "place bet" in that window would
 * get silence, which reads as a broken game rather than a slow one.
 *
 * Also drives `initialise()`, so any board mounting is enough to mint seeds —
 * previously only the fairness panel did, which coupled a game's ability to
 * run to an unrelated component being on screen.
 */
export function useCasinoReady(): boolean {
  const hydrated = useHydrated();
  const initialise = useGameStore((state) => state.initialise);
  const serverSeedHash = useGameStore((state) => state.serverSeedHash);

  useEffect(() => {
    void initialise();
  }, [initialise]);

  return hydrated && Boolean(serverSeedHash);
}
