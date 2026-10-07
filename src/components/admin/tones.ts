import type { AccountStatus, KycStatus } from "@/types";
import type { BadgeTone } from "@/components/ui/Badge";

/** Shared badge tones so the same status reads the same colour on every admin screen. */
export const PLAYER_STATUS_TONE: Record<AccountStatus, BadgeTone> = {
  active: "success",
  pending: "info",
  suspended: "danger",
  locked: "warning",
  self_excluded: "warning",
  closed: "neutral",
};

export const KYC_TONE: Record<KycStatus, BadgeTone> = {
  verified: "success",
  pending: "info",
  rejected: "danger",
  expired: "warning",
  not_started: "neutral",
};
