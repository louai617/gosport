import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getAdminT } from "@/i18n/server";
import { requirePageAdmin } from "@/server/auth/pageGuard";
import { CreatePlayerForm } from "@/components/admin/CreatePlayerForm";

export const metadata: Metadata = { title: "Create player" };

export default async function CreatePlayerPage() {
  await requirePageAdmin("players.create");
  const t = await getAdminT();

  return (
    <div className="max-w-3xl space-y-5">
      <Link
        href="/admin/players"
        className="inline-flex items-center gap-1.5 text-small text-ink-muted hover:text-ink"
      >
        <ArrowLeft size={14} aria-hidden="true" className="flip-rtl" />
        {t("admin.players.title")}
      </Link>
      <header>
        <h1 className="text-h1 text-ink">{t("admin.players.create")}</h1>
        <p className="mt-1 text-small text-ink-muted">{t("admin.players.createDescription")}</p>
      </header>
      <CreatePlayerForm />
    </div>
  );
}
