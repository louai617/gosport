import { cn } from "@/lib/cn";
import { BetSlipPanel } from "@/components/betting/BetSlipPanel";

export interface SportsbookShellProps {
  sidebar: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

/**
 * The three-column sportsbook frame: rail · board · slip.
 *
 * Collapses in two steps rather than one. Below `xl` the bet slip leaves the
 * page for the mobile bottom sheet; below `lg` the left rail goes into the
 * navigation drawer. Between those the board gets the full width, which is
 * what a tablet user actually wants.
 */
export function SportsbookShell({ sidebar, children, className }: SportsbookShellProps) {
  return (
    <div
      className={cn(
        "mx-auto grid max-w-[1440px] gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[260px_minmax(0,1fr)] lg:px-8 xl:grid-cols-[260px_minmax(0,1fr)_340px] xl:gap-7",
        className,
      )}
    >
      <aside className="hidden lg:block">
        <div className="sticky top-[calc(var(--spacing-header)+var(--spacing-sportsnav)+1rem)] max-h-[calc(100dvh-var(--spacing-header)-var(--spacing-sportsnav)-2rem)] overflow-y-auto scroll-slim rounded-xl border border-line bg-surface p-3">
          {sidebar}
        </div>
      </aside>

      <div className="min-w-0">{children}</div>

      <div className="hidden xl:block">
        <BetSlipPanel />
      </div>
    </div>
  );
}
