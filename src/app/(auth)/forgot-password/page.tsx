import type { Metadata } from "next";
import Link from "next/link";
import { getT } from "@/i18n/server";
import { AuthShell } from "@/components/auth/AuthShell";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("auth.forgot.title") };
}

export default async function ForgotPasswordPage() {
  const t = await getT();

  return (
    <AuthShell
      title={t("auth.forgot.title")}
      description={t("auth.forgot.description")}
      footer={
        <Link
          href="/login"
          className="font-semibold text-primary underline-offset-2 hover:underline"
        >
          {t("auth.forgot.backToLogin")}
        </Link>
      }
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
