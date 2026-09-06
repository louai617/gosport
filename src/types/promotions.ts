export type PromotionKind =
  | "welcome"
  | "sport"
  | "weekend"
  | "live"
  | "loyalty"
  | "seasonal";

export type PromotionStatus = "active" | "scheduled" | "expired" | "disabled";

export interface Promotion {
  id: string;
  slug: string;
  kind: PromotionKind;
  titleKey: string;
  summaryKey: string;
  descriptionKey: string;
  /** i18n keys, rendered as a bullet list. */
  eligibilityKeys: string[];
  termsKeys: string[];
  status: PromotionStatus;
  startsAt: string;
  endsAt: string | null;
  /** Route the CTA points at. */
  ctaHref: string;
  ctaLabelKey: string;
  /** Accent hue for the card's generated artwork. */
  hue: number;
  featured: boolean;
  /**
   * Promotions are illustrative only in demo mode. No offer here is
   * redeemable and none constitutes a financial promotion.
   */
  simulated: boolean;
}
