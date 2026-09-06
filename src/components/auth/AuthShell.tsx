import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { getT } from "@/i18n/server";
import { Logo } from "@/components/brand/Logo";

export interface AuthShellProps {
  title: string;
  description: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

/**
 * Two-panel auth frame.
 *
 * The left panel is not decoration: it is where the age restriction, the demo
 * disclosure and the responsible-gambling link live, so a visitor sees them
 * before they fill in a form rather than after. On mobile it collapses to a
 * compact strip above the form for the same reason — it never disappears.
 */
export async function AuthShell({ title, description, children, footer }: AuthShellProps) {
  const t = await getT();

  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <aside className="gradient-hero relative hidden flex-col justify-between border-e border-line p-10 lg:flex">
        <Logo href="/" size="lg" />

        <div className="max-w-md">
          <p className="text-display text-ink">{t("brand.tagline")}</p>
          <p className="mt-4 text-body leading-relaxed text-ink-muted">
            {t("auth.aside.body")}
          </p>
        </div>

        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-lg border border-line bg-surface/70 p-3.5">
            <span
              aria-hidden="true"
              className="numeric grid size-8 shrink-0 place-items-center rounded-full border-2 border-danger text-caption font-bold text-danger"
            >
              18+
            </span>
            <p className="text-small leading-relaxed text-ink-muted">
              {t("common.legal.ageWarning")}
            </p>
          </div>

          <div className="flex items-start gap-3 rounded-lg border border-warning/25 bg-warning-soft/40 p-3.5">
            <ShieldCheck size={17} aria-hidden="true" className="mt-0.5 shrink-0 text-warning" />
            <p className="text-small leading-relaxed text-ink-muted">
              <span className="font-semibold text-warning">{t("common.demo.badge")}</span>{" "}
              {t("auth.aside.demoNotice")}
            </p>
          </div>
        </div>
      </aside>

      <main className="flex flex-col px-4 py-8 sm:px-8 lg:px-12 lg:py-10">
        <div className="lg:hidden">
          <Logo href="/" size="md" />
        </div>

        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-8">
          <h1 className="text-h1 text-ink">{title}</h1>
          <p className="mt-1.5 text-small text-ink-muted">{description}</p>

          {/* Mobile fallback for the aside's compliance block. */}
          <p className="mt-4 rounded-lg border border-warning/25 bg-warning-soft/40 p-3 text-caption normal-case leading-relaxed tracking-normal text-ink-muted lg:hidden">
            <span className="font-semibold text-warning">{t("common.demo.badge")}</span>{" "}
            {t("auth.aside.demoNotice")}
          </p>

          <div className="mt-6">{children}</div>

          {footer ? <div className="mt-6 text-small text-ink-muted">{footer}</div> : null}

          <p className="mt-8 text-caption normal-case leading-relaxed tracking-normal text-ink-subtle">
            {t("common.legal.noLicence")}{" "}
            <Link
              href="/responsible-gambling"
              className="font-semibold text-primary underline-offset-2 hover:underline"
            >
              {t("footer.responsibleGambling")}
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
