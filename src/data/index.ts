import type { MockDataset } from "./types";
import { buildDataset } from "./dataset";

/**
 * The demo data provider.
 *
 * `getDataset()` is memoised into 15-second buckets. Two things depend on
 * that:
 *
 *  1. **Render stability.** Every call inside one server render — and the
 *     matching client hydration — sees the same board. Rebuilding per call
 *     would make a live minute tick between two components on the same page.
 *  2. **Cost.** Generating ~150 fixtures with their books is not free, and a
 *     page can touch the dataset a dozen times.
 *
 * The bucket still advances, so live clocks and scores move as the user
 * watches. Call `resetDatasetCache()` in tests to force a rebuild.
 */
const BUCKET_MS = 15_000;

let cachedBucket: number | null = null;
let cached: MockDataset | null = null;

export function getDataset(): MockDataset {
  const bucket = Math.floor(Date.now() / BUCKET_MS);

  if (cached === null || cachedBucket !== bucket) {
    cached = buildDataset(bucket * BUCKET_MS);
    cachedBucket = bucket;
  }

  return cached;
}

export function resetDatasetCache(): void {
  cached = null;
  cachedBucket = null;
}

export type { MockDataset } from "./types";
