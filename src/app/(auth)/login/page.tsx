import type { Metadata } from "next";
import Link from "next/link";
import { getT } from "@/i18n/server";
import { AuthShell } from "@/components/auth/AuthShell";
import { LoginForm } from "@/components/auth/LoginForm";
import { Alert } from "@/components/ui/Alert";
import { getSessionUser } from "@/server/auth/guard";
import { redirect } from "next/navigation";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("auth.login.title") };
}

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function LoginPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const [t, user] = await Promise.all([getT(), getSessionUser()]);
  // Already signed in: nothing to do here.
  if (user) redirect(user.role === "admin" ? "/admin" : "/account");
  const next = typeof params.next === "string" ? params.next : undefined;
  const justReset = params.reset === "1";

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
      {justReset ? (
        <Alert tone="success" className="mb-4">
          {t("auth.reset.done")}
        </Alert>
      ) : null}
      <LoginForm next={next} />
    </AuthShell>
  );
}
