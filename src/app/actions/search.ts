"use server";

import { search } from "@/services/sportsService";
import type { SearchResponse } from "@/services/types";

/**
 * Search from the client without a round trip through a public API route.
 *
 * The route handlers under `/api` exist too and return the same data — this
 * action simply avoids the client needing to know about them for the header's
 * autocomplete. Input is trimmed and length-capped here rather than trusted
 * from the caller, because a server action is a public endpoint like any other.
 */
export async function searchAction(query: string): Promise<SearchResponse> {
  const trimmed = query.trim().slice(0, 64);
  if (trimmed.length < 2) return { query: trimmed, results: [], total: 0 };
  return search(trimmed, 8);
}
