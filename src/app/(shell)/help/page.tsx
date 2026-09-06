import type { Metadata } from "next";
import { getT } from "@/i18n/server";
import { Alert } from "@/components/ui/Alert";
import { StaticPage } from "@/components/layout/StaticPage";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("legal.help.title") };
}

export default async function HelpPage() {
  const t = await getT();

  return (
    <StaticPage
      title={t("legal.help.title")}
      intro={t("legal.help.intro")}
      updated={t("legal.updated")}
      sections={[
        { heading: t("legal.help.s1.h"), paragraphs: [t("legal.help.s1.p1")] },
        { heading: t("legal.help.s2.h"), paragraphs: [t("legal.help.s2.p1")] },
        { heading: t("legal.help.s3.h"), paragraphs: [t("legal.help.s3.p1")] },
        { heading: t("legal.help.s4.h"), paragraphs: [t("legal.help.s4.p1")] },
      ]}
      footer={
        <Alert tone="warning" title={t("common.demo.badge")}>
          {t("legal.demoNotice")}
        </Alert>
      }
    />
  );
}
