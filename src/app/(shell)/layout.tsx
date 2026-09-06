import { SiteShell } from "@/components/layout/SiteShell";

export default function ShellLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <SiteShell showSportsNav>{children}</SiteShell>;
}
