import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getAdminT } from "@/i18n/server";
import { requirePageAdmin } from "@/server/auth/pageGuard";
import { can } from "@/server/auth/permissions";
import { getOwnBalance } from "@/services/creditService";
import { formatAmount } from "@/lib/format";
import { getRequestLocale } from "@/i18n/server";
import { CreateAccountForm } from "@/components/admin/CreateAccountForm";

export const metadata: Metadata = { title: "Create player" };

export default async function CreatePlayerPage() {
  const user = await requirePageAdmin("players.create");
  const [t, locale] = await Promise.all([getAdminT(), getRequestLocale()]);
  // Only a manager has a balance to sell from.
  const sells = can(user.role, "credit.distribute");
  const balance = sells ? formatAmount(await getOwnBalance(user), locale) : undefined;

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
      <CreateAccountForm kind="player" creditEnabled={sells} balanceLabel={balance} />
    </div>
  );
}
