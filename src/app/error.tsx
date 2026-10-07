"use client";

import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";
import { useT } from "@/i18n/I18nProvider";
import { Button } from "@/components/ui/Button";

/**
 * Route error boundary.
 *
 * `error.digest` is the only detail shown: the message itself may carry
 * internal state, and a production build should never render it to a visitor.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useT();

  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      console.error(error);
    }
  }, [error]);

  return (
    <div
      // Marker for scripts/smoke.sh — a rendered error boundary still returns
      // 200, so the status code alone cannot tell a broken page from a good one.
      data-error-boundary="route"
      className="flex min-h-[60dvh] flex-col items-center justify-center gap-5 px-4 text-center"
    >
      <span
        aria-hidden="true"
        className="grid size-14 place-items-center rounded-full border border-danger/30 bg-danger-soft text-danger"
      >
        <TriangleAlert size={24} />
      </span>

      <div>
        <h1 className="text-h1 text-ink">{t("error.title")}</h1>
        <p className="mt-2 max-w-md text-small leading-relaxed text-ink-muted">
          {t("error.generic")}
        </p>
        {error.digest ? (
          <p className="numeric mt-3 text-caption normal-case tracking-normal text-ink-subtle">
            {error.digest}
          </p>
        ) : null}
      </div>

      <Button onClick={reset}>{t("error.tryAgain")}</Button>
    </div>
  );
}
