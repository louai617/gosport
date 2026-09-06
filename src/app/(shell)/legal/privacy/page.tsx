import type { Metadata } from "next";
import { getT } from "@/i18n/server";
import { Alert } from "@/components/ui/Alert";
import { StaticPage } from "@/components/layout/StaticPage";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("legal.privacy.title") };
}

export default async function PrivacyPage() {
  const t = await getT();

  return (
    <StaticPage
      title={t("legal.privacy.title")}
      intro={t("legal.privacy.intro")}
      updated={t("legal.updated")}
      sections={[
        { heading: t("legal.privacy.s1.h"), paragraphs: [t("legal.privacy.s1.p1")] },
        { heading: t("legal.privacy.s2.h"), paragraphs: [t("legal.privacy.s2.p1")] },
        { heading: t("legal.privacy.s3.h"), paragraphs: [t("legal.privacy.s3.p1")] },
        { heading: t("legal.privacy.s4.h"), paragraphs: [t("legal.privacy.s4.p1")] },
      ]}
      footer={
        <Alert tone="warning" title={t("common.demo.badge")}>
          {t("legal.demoNotice")}
        </Alert>
      }
    />
  );
}
