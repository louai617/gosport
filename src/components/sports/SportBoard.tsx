"use client";

import { CalendarX } from "lucide-react";
import type { CompetitionWithEvents } from "@/types";
import { useT } from "@/i18n/I18nProvider";
import { EmptyState } from "@/components/ui/EmptyState";
import { CompetitionSection } from "./CompetitionSection";

export interface SportBoardProps {
  blocks: CompetitionWithEvents[];
}

/**
 * The fixture board. Only the first few competitions open by default — a page
 * that renders two hundred expanded rows is slower to scan, not richer.
 */
export function SportBoard({ blocks }: SportBoardProps) {
  const t = useT();

  if (blocks.length === 0) {
    return (
      <div className="rounded-xl border border-line bg-surface">
        <EmptyState
          icon={<CalendarX size={20} aria-hidden="true" />}
          title={t("empty.noMatches")}
          description={t("empty.tryDifferentFilter")}
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {blocks.map((block, index) => (
        <CompetitionSection
          key={block.competition.id}
          block={block}
          defaultOpen={index < 4}
        />
      ))}
    </div>
  );
}
