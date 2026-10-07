import type { Metadata } from "next";
import Link from "next/link";
import { getT } from "@/i18n/server";
import { ResponsibleTools } from "@/components/responsible/ResponsibleTools";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("account.responsible.title") };
}

export default async function AccountResponsiblePage() {
  const t = await getT();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-h1 text-ink">{t("account.responsible.title")}</h1>
        <p className="mt-1 text-small text-ink-muted">
          {t("account.responsible.description")}
        </p>
      </header>

      <ResponsibleTools />

      <p className="text-small text-ink-muted">
        <Link
          href="/responsible-gambling"
          className="font-semibold text-primary underline-offset-2 hover:underline"
        >
          {t("responsible.title")}
        </Link>
      </p>
    </div>
  );
}
