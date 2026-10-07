import type { Metadata } from "next";
import { getT } from "@/i18n/server";
import { SecurityPanel } from "@/components/account/SecurityPanel";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("account.security.title") };
}

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function SecurityPage({ searchParams }: PageProps) {
  const params = await searchParams;
  return <SecurityPanel forced={params.forced === "1"} />;
}
