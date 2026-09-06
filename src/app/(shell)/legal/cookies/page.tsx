import type { Metadata } from "next";
import { getT } from "@/i18n/server";
import { Alert } from "@/components/ui/Alert";
import { StaticPage } from "@/components/layout/StaticPage";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("legal.cookies.title") };
}

export default async function CookiesPage() {
  const t = await getT();

  return (
    <StaticPage
      title={t("legal.cookies.title")}
      intro={t("legal.cookies.intro")}
      updated={t("legal.updated")}
      sections={[
        { heading: t("legal.cookies.s1.h"), paragraphs: [t("legal.cookies.s1.p1")] },
        { heading: t("legal.cookies.s2.h"), paragraphs: [t("legal.cookies.s2.p1")] },
      ]}
      footer={
        <Alert tone="warning" title={t("common.demo.badge")}>
          {t("legal.demoNotice")}
        </Alert>
      }
    />
  );
}
