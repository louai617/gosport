import type { Promotion } from "@/types";

/**
 * Promotion catalogue.
 *
 * Illustrative only. Every record is `simulated: true`, nothing here is
 * redeemable, and the copy behind these keys must avoid any suggestion that
 * betting is a way to make money — that framing is prohibited under most
 * advertising codes and is wrong regardless.
 */
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export function buildPromotions(nowMs: number): Promotion[] {
  const iso = (offsetDays: number) => new Date(nowMs + offsetDays * DAY).toISOString();

  return [
    {
      id: "promo-ligue1",
      slug: "ligue1-boost",
      kind: "sport",
      titleKey: "promo.ligue1-boost.title",
      summaryKey: "promo.ligue1-boost.summary",
      descriptionKey: "promo.ligue1-boost.description",
      eligibilityKeys: [
        "promo.ligue1-boost.eligibility.1",
        "promo.ligue1-boost.eligibility.2",
      ],
      termsKeys: [
        "promo.ligue1-boost.terms.1",
        "promo.ligue1-boost.terms.2",
        "promo.ligue1-boost.terms.3",
      ],
      status: "active",
      startsAt: iso(-7),
      endsAt: iso(21),
      ctaHref: "/sports/football",
      ctaLabelKey: "promo.cta.viewMatches",
      hue: 152,
      featured: true,
      simulated: true,
    },
    {
      id: "promo-weekend",
      slug: "weekend-multi",
      kind: "weekend",
      titleKey: "promo.weekend-multi.title",
      summaryKey: "promo.weekend-multi.summary",
      descriptionKey: "promo.weekend-multi.description",
      eligibilityKeys: [
        "promo.weekend-multi.eligibility.1",
        "promo.weekend-multi.eligibility.2",
      ],
      termsKeys: ["promo.weekend-multi.terms.1", "promo.weekend-multi.terms.2"],
      status: "active",
      startsAt: iso(-3),
      endsAt: iso(4),
      ctaHref: "/sports",
      ctaLabelKey: "promo.cta.buildMultiple",
      hue: 268,
      featured: false,
      simulated: true,
    },
    {
      id: "promo-live",
      slug: "live-cashback",
      kind: "live",
      titleKey: "promo.live-cashback.title",
      summaryKey: "promo.live-cashback.summary",
      descriptionKey: "promo.live-cashback.description",
      eligibilityKeys: [
        "promo.live-cashback.eligibility.1",
        "promo.live-cashback.eligibility.2",
      ],
      termsKeys: [
        "promo.live-cashback.terms.1",
        "promo.live-cashback.terms.2",
        "promo.live-cashback.terms.3",
      ],
      status: "active",
      startsAt: iso(-14),
      endsAt: iso(45),
      ctaHref: "/live",
      ctaLabelKey: "promo.cta.watchLive",
      hue: 8,
      featured: false,
      simulated: true,
    },
    {
      id: "promo-loyalty",
      slug: "loyalty-club",
      kind: "loyalty",
      titleKey: "promo.loyalty-club.title",
      summaryKey: "promo.loyalty-club.summary",
      descriptionKey: "promo.loyalty-club.description",
      eligibilityKeys: ["promo.loyalty-club.eligibility.1"],
      termsKeys: ["promo.loyalty-club.terms.1", "promo.loyalty-club.terms.2"],
      status: "scheduled",
      startsAt: iso(14),
      endsAt: null,
      ctaHref: "/promotions/loyalty-club",
      ctaLabelKey: "promo.cta.learnMore",
      hue: 44,
      featured: false,
      simulated: true,
    },
    {
      id: "promo-caf",
      slug: "caf-special",
      kind: "seasonal",
      titleKey: "promo.caf-special.title",
      summaryKey: "promo.caf-special.summary",
      descriptionKey: "promo.caf-special.description",
      eligibilityKeys: ["promo.caf-special.eligibility.1", "promo.caf-special.eligibility.2"],
      termsKeys: ["promo.caf-special.terms.1", "promo.caf-special.terms.2"],
      status: "expired",
      startsAt: iso(-90),
      endsAt: iso(-12),
      ctaHref: "/promotions/caf-special",
      ctaLabelKey: "promo.cta.learnMore",
      hue: 190,
      featured: false,
      simulated: true,
    },
  ];
}
