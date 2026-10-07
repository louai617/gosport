import type { Metadata } from "next";
import { requirePageAdmin } from "@/server/auth/pageGuard";
import { SecurityPanel } from "@/components/account/SecurityPanel";

export const metadata: Metadata = { title: "Security" };

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** The administrator's own password and sessions — and the forced-change landing page. */
export default async function AdminSecurityPage({ searchParams }: PageProps) {
  await requirePageAdmin();
  const params = await searchParams;
  return <SecurityPanel forced={params.forced === "1"} />;
}
