import type { Metadata } from "next";
import { getT } from "@/i18n/server";
import { Alert } from "@/components/ui/Alert";
import { StaticPage } from "@/components/layout/StaticPage";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("legal.contact.title") };
}

export default async function ContactPage() {
  const t = await getT();

  return (
    <StaticPage
      title={t("legal.contact.title")}
      intro={t("legal.contact.intro")}
      updated={t("legal.updated")}
      sections={[
        { heading: t("legal.contact.s1.h"), paragraphs: [t("legal.contact.s1.p1")] },
      ]}
      footer={
        <Alert tone="warning" title={t("common.demo.badge")}>
          {t("legal.demoNotice")}
        </Alert>
      }
    />
  );
}
