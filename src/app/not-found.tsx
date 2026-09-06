import Link from "next/link";
import { Compass } from "lucide-react";
import { getT } from "@/i18n/server";
import { buttonStyles } from "@/components/ui/Button";
import { Logo } from "@/components/brand/Logo";

export default async function NotFound() {
  const t = await getT();

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 text-center">
      <Logo href="/" size="md" />

      <span
        aria-hidden="true"
        className="grid size-14 place-items-center rounded-full border border-line bg-surface-2 text-ink-subtle"
      >
        <Compass size={24} />
      </span>

      <div>
        <p className="numeric text-caption uppercase text-ink-subtle">404</p>
        <h1 className="mt-1 text-h1 text-ink">{t("error.notFound.title")}</h1>
        <p className="mt-2 max-w-md text-small leading-relaxed text-ink-muted">
          {t("error.notFound.body")}
        </p>
      </div>

      <Link href="/" className={buttonStyles()}>
        {t("error.goHome")}
      </Link>
    </div>
  );
}
