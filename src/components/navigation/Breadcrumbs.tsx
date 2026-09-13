import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

export interface BreadcrumbItem {
  label: string;
  /** Omitted for the current page, which is rendered as plain text. */
  href?: string;
  icon?: React.ReactNode;
}

export interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  /** Localised landmark label, e.g. "Breadcrumb". */
  label: string;
  className?: string;
}

/** The trail back up the sportsbook tree: Football › England › Premier League. */
export function Breadcrumbs({ items, label, className }: BreadcrumbsProps) {
  return (
    <nav aria-label={label} className={cn("min-w-0", className)}>
      <ol className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5 text-small">
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="flex min-w-0 items-center gap-1">
              {item.href && !last ? (
                <Link
                  href={item.href}
                  className="flex min-w-0 items-center gap-1.5 rounded-sm text-ink-subtle transition-colors duration-fast hover:text-ink"
                >
                  {item.icon}
                  <span className="truncate">{item.label}</span>
                </Link>
              ) : (
                <span
                  aria-current={last ? "page" : undefined}
                  className="flex min-w-0 items-center gap-1.5 text-ink-muted"
                >
                  {item.icon}
                  <span className="truncate">{item.label}</span>
                </span>
              )}
              {!last ? (
                <ChevronRight
                  size={13}
                  aria-hidden="true"
                  className="flip-rtl shrink-0 text-ink-subtle"
                />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
