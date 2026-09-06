import type { Metadata } from "next";
import Link from "next/link";
import { getT } from "@/i18n/server";
import { AuthShell } from "@/components/auth/AuthShell";
import { RegisterForm } from "@/components/auth/RegisterForm";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("auth.register.title") };
}

export default async function RegisterPage() {
  const t = await getT();

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
      <RegisterForm />
    </AuthShell>
  );
}
