import type { Metadata } from "next";
import Link from "next/link";
import { getT } from "@/i18n/server";
import { AuthShell } from "@/components/auth/AuthShell";
import { LoginForm } from "@/components/auth/LoginForm";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("auth.login.title") };
}

export default async function LoginPage() {
  const t = await getT();

  return (
    <AuthShell
      title={t("auth.login.title")}
      description={t("auth.login.description")}
      footer={
        <>
          {t("auth.login.noAccount")}{" "}
          <Link
            href="/register"
            className="font-semibold text-primary underline-offset-2 hover:underline"
          >
            {t("nav.register")}
          </Link>
        </>
      }
    >
      <LoginForm />
    </AuthShell>
  );
}
