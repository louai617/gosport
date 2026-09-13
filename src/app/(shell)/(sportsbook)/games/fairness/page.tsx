import type { Metadata } from "next";
import { getT } from "@/i18n/server";
import { Alert } from "@/components/ui/Alert";
import { FairnessVerifier } from "@/components/games/FairnessVerifier";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("games.verify.title") };
}

const STEPS = [1, 2, 3, 4] as const;

export default async function FairnessPage() {
  const t = await getT();

  return (
    <div className="max-w-3xl">
      <header>
        <h1 className="text-display text-ink">{t("games.verify.title")}</h1>
        <p className="mt-2 text-body leading-relaxed text-ink-muted">
          {t("games.verify.subtitle")}
        </p>
      </header>

      <section aria-labelledby="how" className="mt-8">
        <h2 id="how" className="text-h2 text-ink">
          {t("games.verify.howTitle")}
        </h2>
        <ol className="mt-3 space-y-2">
          {STEPS.map((step) => (
            <li key={step} className="flex gap-3">
              <span className="numeric grid size-6 shrink-0 place-items-center rounded-full bg-primary-soft text-caption font-bold text-primary">
                {step}
              </span>
              <span className="text-small leading-relaxed text-ink-muted">
                {t(`games.verify.step.${step}`)}
              </span>
            </li>
          ))}
        </ol>
      </section>

      {/* The honest caveat, stated on the page that would otherwise imply the
          strongest guarantee in the product. */}
      <Alert tone="warning" className="mt-6" title={t("common.demo.badge")}>
        {t("games.fair.demoCaveat")}
      </Alert>

      <section aria-labelledby="verify" className="mt-8">
        <h2 id="verify" className="mb-4 text-h2 text-ink">
          {t("games.verify.formTitle")}
        </h2>
        <FairnessVerifier />
      </section>
    </div>
  );
}
