"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { useT } from "@/i18n/I18nProvider";
import { Button } from "@/components/ui/Button";

/**
 * A secret link shown to the operator exactly once. It is read-only and copyable;
 * the page it appears on says plainly that it will not be shown again, because
 * the server keeps only a hash of it.
 */
export function OneTimeLink({ link }: { link: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the field is selectable, so the operator can copy by hand.
    }
  };

  return (
    <div className="flex items-center gap-2">
      <input
        readOnly
        value={link}
        onFocus={(event) => event.currentTarget.select()}
        aria-label={t("admin.link.label")}
        className="numeric h-9 min-w-0 flex-1 rounded-md border border-line bg-surface-2 px-3 text-small text-ink"
      />
      <Button type="button" variant="secondary" size="sm" onClick={copy}>
        {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
        {copied ? t("admin.link.copied") : t("admin.link.copy")}
      </Button>
    </div>
  );
}
