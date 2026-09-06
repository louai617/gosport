import { cn } from "@/lib/cn";

export interface StaticPageSection {
  headingKey: string;
  /** Paragraph keys, rendered in order. */
  bodyKeys: string[];
  /** Optional bullet list beneath the paragraphs. */
  listKeys?: string[];
}

export interface StaticPageProps {
  title: string;
  intro?: string;
  updated?: string;
  sections: Array<{
    heading: string;
    paragraphs: string[];
    list?: string[];
  }>;
  footer?: React.ReactNode;
  className?: string;
}

/**
 * Shared frame for terms, privacy, cookies and help.
 *
 * Prose gets a measure cap and a table of contents once there are enough
 * sections to need one — legal copy that runs the full width of a 1440px
 * screen is technically present and practically unread.
 */
export function StaticPage({
  title,
  intro,
  updated,
  sections,
  footer,
  className,
}: StaticPageProps) {
  const slug = (heading: string) =>
    heading.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  return (
    <div className={cn("mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8", className)}>
      <header>
        <h1 className="text-display text-ink">{title}</h1>
        {intro ? (
          <p className="mt-3 text-body leading-relaxed text-ink-muted">{intro}</p>
        ) : null}
        {updated ? (
          <p className="numeric mt-2 text-caption normal-case tracking-normal text-ink-subtle">
            {updated}
          </p>
        ) : null}
      </header>

      {sections.length > 3 ? (
        <nav aria-label={title} className="mt-6 rounded-xl border border-line bg-surface p-4">
          <ol className="space-y-1.5">
            {sections.map((section, index) => (
              <li key={section.heading} className="flex gap-2 text-small">
                <span className="numeric shrink-0 text-ink-subtle">{index + 1}.</span>
                <a
                  href={`#${slug(section.heading)}`}
                  className="text-ink-muted underline-offset-2 transition-colors duration-fast hover:text-primary hover:underline"
                >
                  {section.heading}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      ) : null}

      <div className="mt-8 space-y-8">
        {sections.map((section) => (
          <section key={section.heading} id={slug(section.heading)}>
            <h2 className="text-h2 text-ink">{section.heading}</h2>
            {section.paragraphs.map((paragraph) => (
              <p
                key={paragraph.slice(0, 40)}
                className="mt-3 text-small leading-relaxed text-ink-muted"
              >
                {paragraph}
              </p>
            ))}
            {section.list ? (
              <ul className="mt-3 space-y-2">
                {section.list.map((item) => (
                  <li key={item.slice(0, 40)} className="flex gap-2.5">
                    <span
                      aria-hidden="true"
                      className="mt-2 size-1 shrink-0 rounded-full bg-primary"
                    />
                    <span className="text-small leading-relaxed text-ink-muted">{item}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ))}
      </div>

      {footer ? <div className="mt-10">{footer}</div> : null}
    </div>
  );
}
