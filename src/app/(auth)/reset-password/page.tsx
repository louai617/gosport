import type { Metadata } from "next";
import Link from "next/link";
import { getT } from "@/i18n/server";
import { inspectPasswordToken } from "@/services/authService";
import { AuthShell } from "@/components/auth/AuthShell";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import { Alert } from "@/components/ui/Alert";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("auth.reset.title"), robots: { index: false, follow: false } };
}

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Landing page for a one-time link — a password reset, or an invitation an
 * operator handed over. The token is checked *without being consumed* so an
 * invalid or expired link shows an honest message instead of a form that will
 * fail; it is only spent when the new password is submitted.
 */
export default async function ResetPasswordPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : "";
  const [t, inspection] = await Promise.all([getT(), inspectPasswordToken(token)]);

  return (
    <AuthShell
      title={t("auth.reset.title")}
      description={t("auth.reset.description")}
      footer={
        <Link href="/login" className="font-semibold text-primary underline-offset-2 hover:underline">
          {t("auth.forgot.backToLogin")}
        </Link>
      }
    >
      {inspection.valid ? (
        <ResetPasswordForm token={token} />
      ) : (
        <Alert tone="danger" title={t("auth.reset.invalidTitle")}>
          {t("auth.reset.invalidBody")}
        </Alert>
      )}
    </AuthShell>
  );
}
