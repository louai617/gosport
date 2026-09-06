import { getCurrentUser, getNotifications } from "@/services/userService";
import { getWallet } from "@/services/paymentService";
import { getSports } from "@/services/sportsService";
import { getT } from "@/i18n/server";
import { DemoBanner } from "./DemoBanner";
import { Footer } from "./Footer";
import { Header } from "./Header";
import { SportsNav } from "@/components/navigation/SportsNav";
import { BetSlipMobile } from "@/components/betting/BetSlipMobile";

export interface SiteShellProps {
  /** The sports switcher belongs on the sportsbook, not on account screens. */
  showSportsNav?: boolean;
  children: React.ReactNode;
}

/**
 * Shared site chrome. Fetched once here and passed down, so the header and
 * sports navigation stay client components for interactivity without each of
 * them opening its own request.
 */
export async function SiteShell({ showSportsNav = false, children }: SiteShellProps) {
  const [t, sports, notifications, user, wallet] = await Promise.all([
    getT(),
    getSports(),
    getNotifications(),
    getCurrentUser(),
    // The one balance in the product — `paymentService` owns it, the header
    // only displays it. No second source of truth is introduced here.
    getWallet(),
  ]);

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only-focusable absolute z-90 m-3 rounded-md bg-primary px-3 py-2 text-small font-semibold text-ink-inverse"
      >
        {t("nav.skipToContent")}
      </a>

      <DemoBanner />
      <Header sports={sports} notifications={notifications} user={user} wallet={wallet} />
      {showSportsNav ? <SportsNav sports={sports} /> : null}

      <main id="main" className="flex-1">
        {children}
      </main>

      <Footer />
      <BetSlipMobile />
    </div>
  );
}
