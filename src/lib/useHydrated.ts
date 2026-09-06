"use client";

import { useEffect, useState } from "react";

/**
 * `false` on the server and on the first client render, `true` afterwards.
 *
 * The bet slip is persisted to localStorage, so its contents cannot exist
 * during SSR. Rendering the stored state before this flips would be a
 * hydration mismatch; components use it to show a placeholder for one frame.
 */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}
