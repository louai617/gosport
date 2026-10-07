import type { Metadata } from "next";
import Link from "next/link";
import { getT } from "@/i18n/server";
import { AuthShell } from "@/components/auth/AuthShell";
import { RegisterForm } from "@/components/auth/RegisterForm";
import { Alert } from "@/components/ui/Alert";
import { getSetting } from "@/server/settings/settingsService";
import { getSessionUser } from "@/server/auth/guard";
import { redirect } from "next/navigation";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("auth.register.title") };
}

export default async function RegisterPage() {
  const [t, registrationOpen, user] = await Promise.all([
    getT(),
    getSetting("players.registrationEnabled"),
    getSessionUser(),
  ]);
  if (user) redirect(user.role === "admin" ? "/admin" : "/account");

  return (
    <AuthShell
      title={t("auth.register.title")}
      description={t("auth.register.description")}
      footer={
        <>
          {t("auth.register.hasAccount")}{" "}
          <Link
            href="/login"
            className="font-semibold text-primary underline-offset-2 hover:underline"
          >
            {t("nav.login")}
          </Link>
        </>
      }
    >
      {registrationOpen ? (
        <RegisterForm />
      ) : (
        <Alert tone="info" title={t("auth.register.closed")}>
          {t("auth.register.closedBody")}
        </Alert>
      )}
    </AuthShell>
  );
}
