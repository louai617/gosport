import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getAdminT } from "@/i18n/server";
import { requirePageAdmin } from "@/server/auth/pageGuard";
import { CreateAccountForm } from "@/components/admin/CreateAccountForm";

export const metadata: Metadata = { title: "Create manager" };

export default async function CreateManagerPage() {
  await requirePageAdmin("managers.create");
  const t = await getAdminT();

  return (
    <div className="max-w-3xl space-y-5">
      <Link
        href="/admin/managers"
        className="inline-flex items-center gap-1.5 text-small text-ink-muted hover:text-ink"
      >
        <ArrowLeft size={14} aria-hidden="true" className="flip-rtl" />
        {t("admin.managers.title")}
      </Link>
      <header>
        <h1 className="text-h1 text-ink">{t("admin.managers.create")}</h1>
        <p className="mt-1 text-small text-ink-muted">{t("admin.managers.createDescription")}</p>
      </header>
      <CreateAccountForm kind="manager" creditEnabled />
    </div>
  );
}
