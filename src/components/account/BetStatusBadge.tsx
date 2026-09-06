"use client";

import type { BetStatus } from "@/types";
import { useT } from "@/i18n/I18nProvider";
import { Badge, type BadgeTone } from "@/components/ui/Badge";

const TONES: Record<BetStatus, BadgeTone> = {
  won: "success",
  lost: "danger",
  pending: "info",
  cancelled: "neutral",
  void: "neutral",
  cashed_out: "warning",
};

const LABELS: Record<BetStatus, string> = {
  won: "account.bets.status.won",
  lost: "account.bets.status.lost",
  pending: "account.bets.status.pending",
  cancelled: "account.bets.status.cancelled",
  void: "account.bets.status.void",
  cashed_out: "account.bets.status.cashedOut",
};

export function BetStatusBadge({ status }: { status: BetStatus }) {
  const t = useT();
  return (
    <Badge tone={TONES[status]} dot>
      {t(LABELS[status])}
    </Badge>
  );
}
