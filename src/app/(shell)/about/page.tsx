import type { Metadata } from "next";
import { getT } from "@/i18n/server";
import { Alert } from "@/components/ui/Alert";
import { StaticPage } from "@/components/layout/StaticPage";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("legal.about.title") };
}

export default async function AboutPage() {
  const t = await getT();

  return (
    <StaticPage
      title={t("legal.about.title")}
      intro={t("legal.about.intro")}
      updated={t("legal.updated")}
      sections={[
        { heading: t("legal.about.s1.h"), paragraphs: [t("legal.about.s1.p1")] },
        { heading: t("legal.about.s2.h"), paragraphs: [t("legal.about.s2.p1")] },
      ]}
      footer={
        <Alert tone="warning" title={t("common.demo.badge")}>
          {t("legal.demoNotice")}
        </Alert>
      }
    />
  );
}
