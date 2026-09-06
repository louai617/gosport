import type { SportKey } from "@/types";

const SPORT_KEYS: readonly SportKey[] = [
  "football",
  "basketball",
  "tennis",
  "handball",
  "volleyball",
  "rugby",
  "boxing",
  "formula1",
];

/** Route params arrive as strings; this is the only place they become a key. */
export function isSportKey(value: string): value is SportKey {
  return (SPORT_KEYS as readonly string[]).includes(value);
}

export { SPORT_KEYS };
