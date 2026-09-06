import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/cn";

export interface SectionProps {
  title: string;
  description?: string;
  /** Rendered at the end of the heading row — a "see all" link, usually. */
  actionHref?: string;
  actionLabel?: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

/**
 * The homepage/board section wrapper. Exists so every section on the site
 * shares one heading rhythm — a page that mixes three heading treatments
 * reads as three pages stapled together.
 */
export function Section({
  title,
  description,
  actionHref,
  actionLabel,
  aside,
  children,
  className,
}: SectionProps) {
  return (
    <section className={cn("min-w-0", className)}>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <h2 className="text-h2 text-ink">{title}</h2>
          {description ? (
            <p className="mt-0.5 text-small text-ink-muted">{description}</p>
          ) : null}
        </div>

        {aside}

        {actionHref && actionLabel ? (
          <Link
            href={actionHref}
            className="group inline-flex shrink-0 items-center gap-1.5 text-small font-semibold text-primary transition-colors duration-fast hover:text-primary-hover"
          >
            {actionLabel}
            <ArrowRight
              size={14}
              aria-hidden="true"
              className="flip-rtl transition-transform duration-base group-hover:translate-x-0.5"
            />
          </Link>
        ) : null}
      </div>

      {children}
    </section>
  );
}
