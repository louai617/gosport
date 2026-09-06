import type { Metadata } from "next";
import { getT } from "@/i18n/server";
import { Alert } from "@/components/ui/Alert";
import { StaticPage } from "@/components/layout/StaticPage";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("legal.terms.title") };
}

export default async function TermsPage() {
  const t = await getT();

  return (
    <StaticPage
      title={t("legal.terms.title")}
      intro={t("legal.terms.intro")}
      updated={t("legal.updated")}
      sections={[
        { heading: t("legal.terms.s1.h"), paragraphs: [t("legal.terms.s1.p1")] },
        { heading: t("legal.terms.s2.h"), paragraphs: [t("legal.terms.s2.p1")] },
        {
          heading: t("legal.terms.s3.h"),
          paragraphs: [t("legal.terms.s3.p1"), t("legal.terms.s3.p2")],
        },
        { heading: t("legal.terms.s4.h"), paragraphs: [t("legal.terms.s4.p1")] },
        { heading: t("legal.terms.s5.h"), paragraphs: [t("legal.terms.s5.p1")] },
      ]}
      footer={
        <Alert tone="warning" title={t("common.demo.badge")}>
          {t("legal.demoNotice")}
        </Alert>
      }
    />
  );
}
