import { Skeleton } from "@/components/ui/Skeleton";

/**
 * Board-only skeleton. It renders inside the sportsbook layout, so following a
 * league in the rail swaps just the centre column — the rail and the slip stay
 * put — and the placeholder mirrors a header over competition blocks.
 */
export default function SportsbookLoading() {
  return (
    <div className="space-y-6" aria-busy="true">
      <div className="space-y-2.5">
        <Skeleton className="h-4 w-40" rounded="sm" />
        <Skeleton className="h-8 w-2/3 max-w-sm" rounded="lg" />
        <Skeleton className="h-4 w-32" rounded="sm" />
      </div>

      {[0, 1, 2].map((block) => (
        <div key={block} className="overflow-hidden rounded-xl border border-line bg-surface">
          <div className="flex items-center gap-2.5 border-b border-line-soft px-3 py-3">
            <Skeleton className="size-6" rounded="md" />
            <div className="space-y-1.5">
              <Skeleton className="h-3 w-36" rounded="sm" />
              <Skeleton className="h-2.5 w-20" rounded="sm" />
            </div>
          </div>
          <div className="divide-y divide-line-soft">
            {[0, 1, 2].map((row) => (
              <div key={row} className="flex items-center gap-4 p-3">
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-2.5 w-24" rounded="sm" />
                  <Skeleton className="h-3 w-40" rounded="sm" />
                  <Skeleton className="h-3 w-32" rounded="sm" />
                </div>
                <div className="hidden gap-1.5 sm:flex">
                  <Skeleton className="h-12 w-20" rounded="md" />
                  <Skeleton className="h-12 w-20" rounded="md" />
                  <Skeleton className="h-12 w-20" rounded="md" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
