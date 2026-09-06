import { cn } from "@/lib/cn";

export interface StatTileProps {
  label: string;
  value: string;
  hint?: string;
  icon?: React.ReactNode;
  tone?: "default" | "primary" | "success" | "warning";
  badge?: React.ReactNode;
  className?: string;
}

const TONES = {
  default: "text-ink",
  primary: "text-primary",
  success: "text-success",
  warning: "text-warning",
} as const;

export function StatTile({
  label,
  value,
  hint,
  icon,
  tone = "default",
  badge,
  className,
}: StatTileProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-line bg-surface p-4 shadow-e1 edge-light",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-caption uppercase text-ink-subtle">{label}</p>
        {icon ? (
          <span aria-hidden="true" className="shrink-0 text-ink-subtle">
            {icon}
          </span>
        ) : null}
      </div>

      <p className={cn("numeric mt-2 text-h1 font-bold", TONES[tone])}>{value}</p>

      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        {hint ? <p className="text-caption normal-case tracking-normal text-ink-subtle">{hint}</p> : null}
        {badge}
      </div>
    </div>
  );
}
