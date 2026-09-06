import { getDataset } from "@/data";
import type { Promotion, PromotionStatus } from "@/types";
import type { PromotionQuery } from "./types";
import { asArray } from "./utils";

/**
 * Promotions.
 *
 * DEMO: every offer in the dataset is illustrative. None is redeemable, none
 * carries a real wagering requirement, and none constitutes a financial
 * promotion — `Promotion.simulated` is true throughout and the cards render a
 * disclaimer from it. A live deployment cannot publish any of this until the
 * advertising_and_promotion_review launch gate is cleared.
 */

/** Live offers first; expired and disabled ones sink but stay reachable by slug. */
const STATUS_RANK: Record<PromotionStatus, number> = {
  active: 0,
  scheduled: 1,
  expired: 2,
  disabled: 3,
};

/** Status band, then featured, then newest — the order the promotions grid reads in. */
function byProminence(a: Promotion, b: Promotion): number {
  const rank = STATUS_RANK[a.status] - STATUS_RANK[b.status];
  if (rank !== 0) return rank;
  if (a.featured !== b.featured) return a.featured ? -1 : 1;
  return Date.parse(b.startsAt) - Date.parse(a.startsAt);
}

export async function getPromotions(query: PromotionQuery = {}): Promise<Promotion[]> {
  const statuses = asArray(query.status);
  const kinds = asArray(query.kind);

  const matched = getDataset().promotions.filter((promotion) => {
    if (statuses.length > 0 && !statuses.includes(promotion.status)) return false;
    if (kinds.length > 0 && !kinds.includes(promotion.kind)) return false;
    if (query.featured !== undefined && promotion.featured !== query.featured) return false;
    return true;
  });

  matched.sort(byProminence);
  return query.limit !== undefined ? matched.slice(0, Math.max(0, query.limit)) : matched;
}

export async function getPromotionBySlug(slug: string): Promise<Promotion | null> {
  return getDataset().promotions.find((promotion) => promotion.slug === slug) ?? null;
}

/** Homepage rail: only offers a player could act on today. */
export async function getFeaturedPromotions(limit = 3): Promise<Promotion[]> {
  return getPromotions({ status: "active", featured: true, limit });
}
