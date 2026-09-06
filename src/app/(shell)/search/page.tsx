import type { Metadata } from "next";
import Link from "next/link";
import { SearchX } from "lucide-react";
import { search } from "@/services/sportsService";
import { getT } from "@/i18n/server";
import { EmptyState } from "@/components/ui/EmptyState";

interface PageProps {
  searchParams: Promise<{ q?: string }>;
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("sportsbook.search.title") };
}

export default async function SearchPage({ searchParams }: PageProps) {
  const { q = "" } = await searchParams;
  const t = await getT();
  const response = await search(q, 40);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-h1 text-ink">
        {q ? t("sportsbook.search.resultsFor", { query: q }) : t("sportsbook.search.title")}
      </h1>

      {!q ? (
        <p className="mt-2 text-small text-ink-muted">{t("sportsbook.search.prompt")}</p>
      ) : response.results.length === 0 ? (
        <div className="mt-6 rounded-xl border border-line bg-surface">
          <EmptyState
            icon={<SearchX size={20} aria-hidden="true" />}
            title={t("empty.noSearchResults", { query: q })}
            description={t("empty.tryDifferentFilter")}
          />
        </div>
      ) : (
        <ul className="mt-6 divide-y divide-line-soft overflow-hidden rounded-xl border border-line bg-surface">
          {response.results.map((result) => (
            <li key={`${result.kind}-${result.id}`}>
              <Link
                href={result.href}
                className="flex items-center gap-3 px-4 py-3 transition-colors duration-fast hover:bg-surface-2/60"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-small font-medium text-ink">
                    {result.kind === "sport" ? t(result.title) : result.title}
                  </span>
                  {result.subtitleKey || result.subtitle ? (
                    <span className="block truncate text-caption normal-case tracking-normal text-ink-subtle">
                      {result.subtitleKey ? t(result.subtitleKey) : result.subtitle}
                    </span>
                  ) : null}
                </span>
                {result.meta ? (
                  <span className="numeric shrink-0 text-caption normal-case tracking-normal text-ink-subtle">
                    {result.meta}
                  </span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
