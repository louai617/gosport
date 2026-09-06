import Link from "next/link";
import { getT } from "@/i18n/server";
import { APP, JURISDICTION, SUPPORT } from "@/config/app.config";
import { Logo } from "@/components/brand/Logo";

const COLUMNS = [
  {
    titleKey: "footer.company",
    links: [
      { href: "/about", labelKey: "footer.about" },
      { href: "/games", labelKey: "nav.games" },
      { href: "/promotions", labelKey: "nav.promotions" },
      { href: "/results", labelKey: "nav.results" },
    ],
  },
  {
    titleKey: "footer.sports",
    links: [
      { href: "/sports/football", labelKey: "sports.football" },
      { href: "/sports/basketball", labelKey: "sports.basketball" },
      { href: "/sports/tennis", labelKey: "sports.tennis" },
      { href: "/sports/handball", labelKey: "sports.handball" },
    ],
  },
  {
    titleKey: "footer.support",
    links: [
      { href: "/help", labelKey: "footer.helpCenter" },
      { href: "/contact", labelKey: "footer.contact" },
      { href: "/responsible-gambling", labelKey: "footer.responsibleGambling" },
    ],
  },
  {
    titleKey: "footer.legal",
    links: [
      { href: "/legal/terms", labelKey: "footer.terms" },
      { href: "/legal/privacy", labelKey: "footer.privacy" },
      { href: "/legal/cookies", labelKey: "footer.cookies" },
    ],
  },
] as const;

/**
 * Server-rendered: the footer is entirely static links and legal copy, so it
 * ships no JavaScript at all.
 */
export async function Footer() {
  const t = await getT();
  const year = new Date().getFullYear();

  return (
    <footer className="mt-12 border-t border-line bg-canvas-soft">
      <div className="mx-auto max-w-[1440px] px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-[1.4fr_repeat(4,1fr)]">
          <div className="max-w-xs">
            <Logo size="md" />
            <p className="mt-3 text-small leading-relaxed text-ink-muted">
              {t("footer.aboutBody")}
            </p>
          </div>

          {COLUMNS.map((column) => (
            <nav key={column.titleKey} aria-label={t(column.titleKey)}>
              <h2 className="mb-3 text-caption uppercase text-ink-subtle">
                {t(column.titleKey)}
              </h2>
              <ul className="space-y-2">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-small text-ink-muted transition-colors duration-fast hover:text-ink"
                    >
                      {t(link.labelKey)}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        {/* ---- compliance block: the part that must never be quietly trimmed --- */}
        <div className="mt-10 space-y-4 border-t border-line-soft pt-6">
          <div className="flex flex-wrap items-center gap-3">
            <span
              aria-label={t("common.legal.ageRestriction")}
              className="numeric grid size-8 shrink-0 place-items-center rounded-full border-2 border-danger text-small font-bold text-danger"
            >
              18+
            </span>
            <p className="text-small font-semibold text-ink">
              {t("common.legal.gambleResponsibly")}
            </p>
          </div>

          <p className="max-w-4xl text-small leading-relaxed text-ink-muted">
            {t("common.legal.ageWarning")}
          </p>

          <p className="max-w-4xl rounded-lg border border-warning/25 bg-warning-soft/40 p-3 text-small leading-relaxed text-ink-muted">
            <span className="font-semibold text-warning">
              {t("common.demo.badge")}
            </span>{" "}
            {t("common.legal.noLicence")}
          </p>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 text-caption normal-case tracking-normal text-ink-subtle">
            <p>{t("footer.copyright", { year })}</p>
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>{t("common.legal.jurisdictionNote")}</span>
              <span aria-hidden="true">·</span>
              <span className="numeric">
                {JURISDICTION.code} · {JURISDICTION.currency} · {APP.mode}
              </span>
              <span aria-hidden="true">·</span>
              <a
                href={`mailto:${SUPPORT.email}`}
                className="transition-colors duration-fast hover:text-ink"
              >
                {SUPPORT.email}
              </a>
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
