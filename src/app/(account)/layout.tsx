import { SiteShell } from "@/components/layout/SiteShell";
import { AccountNav } from "@/components/account/AccountNav";

export default function AccountLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <SiteShell>
      <div className="mx-auto grid max-w-[1440px] gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[236px_minmax(0,1fr)] lg:px-8 lg:py-8">
        <AccountNav />
        <div className="min-w-0">{children}</div>
      </div>
    </SiteShell>
  );
}
