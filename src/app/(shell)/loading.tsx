import { Skeleton, SkeletonCard } from "@/components/ui/Skeleton";

/**
 * Route-level skeleton. Mirrors the real page's geometry — hero, then a grid,
 * then a list — so the layout does not jump when content arrives.
 */
export default function ShellLoading() {
  return (
    <div className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8" aria-busy="true">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:gap-7">
        <div className="min-w-0 space-y-8">
          <div className="space-y-3">
            <Skeleton className="h-9 w-2/3 max-w-lg" rounded="lg" />
            <Skeleton className="h-4 w-1/2 max-w-md" rounded="sm" />
          </div>

          <Skeleton className="h-72 w-full" rounded="xl" />

          <div className="space-y-3">
            <Skeleton className="h-6 w-40" rounded="sm" />
            <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </div>
          </div>
        </div>

        <div className="hidden xl:block">
          <Skeleton className="h-96 w-full" rounded="xl" />
        </div>
      </div>
    </div>
  );
}
