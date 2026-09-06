/**
 * Parsing list/table query strings.
 *
 * Deliberately framework-free and in `lib/`, not alongside the table
 * component: the table is a client component, and a server page that imported
 * a helper from it would fail at request time with "attempted to call a client
 * function from the server" — a failure the build cannot catch, because these
 * routes are dynamic and never prerendered.
 */
export interface ParsedListQuery {
  page: number;
  pageSize: number;
  search?: string;
  sort?: string;
  direction: "asc" | "desc";
}

const MAX_PAGE_SIZE = 100;
const MIN_PAGE_SIZE = 5;

export function parseListQuery(
  params: Record<string, string | undefined>,
): ParsedListQuery {
  // Everything here arrives from the URL, so every value is clamped rather
  // than trusted: `pageSize=100000` is a cheap way to make a server work hard.
  const page = Math.max(1, Number(params.page ?? 1) || 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(MIN_PAGE_SIZE, Number(params.pageSize ?? 20) || 20),
  );

  return {
    page,
    pageSize,
    search: params.search?.trim() || undefined,
    sort: params.sort,
    direction: params.direction === "desc" ? "desc" : "asc",
  };
}
