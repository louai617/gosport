"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Info, X } from "lucide-react";
import { IS_DEMO } from "@/config/app.config";
import { useT } from "@/i18n/I18nProvider";
import { readDemoBannerDismissed, useUiStore } from "@/store/uiStore";

/**
 * The site-wide statement that nothing here is real.
 *
 * Dismissible per session, never per device: a user returning tomorrow is told
 * again. The point is not decoration — a visitor must be able to tell within
 * one screen that no money is involved, and the individual `SimulatedBadge`
 * markers on odds and balances carry the same message at the point of use.
 */
export function DemoBanner() {
  const t = useT();
  const dismissed = useUiStore((state) => state.demoBannerDismissed);
  const dismiss = useUiStore((state) => state.dismissDemoBanner);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (readDemoBannerDismissed()) dismiss();
    setReady(true);
  }, [dismiss]);

  if (!IS_DEMO || (ready && dismissed)) return null;

  return (
    <div className="relative border-b border-primary/25 bg-primary-soft">
      <div className="mx-auto flex max-w-[1440px] items-start gap-3 px-4 py-2.5 sm:px-6 lg:px-8">
        <Info size={15} aria-hidden="true" className="mt-0.5 shrink-0 text-primary" />

        <p className="min-w-0 flex-1 text-small leading-relaxed text-ink-muted">
          <span className="font-semibold text-ink">{t("common.demo.title")}</span>{" "}
          {t("common.demo.body")}{" "}
          <Link
            href="/responsible-gambling"
            className="font-semibold text-primary underline-offset-2 hover:underline"
          >
            {t("common.demo.learnMore")}
          </Link>
        </p>

        <button
          type="button"
          onClick={dismiss}
          aria-label={t("common.demo.dismiss")}
          className="-me-1 grid size-6 shrink-0 cursor-pointer place-items-center rounded-md text-ink-subtle transition-colors duration-fast hover:bg-primary/15 hover:text-ink"
        >
          <X size={14} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
