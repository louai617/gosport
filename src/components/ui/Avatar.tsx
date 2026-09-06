import { cn } from "@/lib/cn";
import { initialsOf } from "@/lib/format";

export type AvatarSize = "xs" | "sm" | "md" | "lg";

export interface AvatarProps {
  name: string;
  size?: AvatarSize;
  src?: string;
  className?: string;
}

const SIZES: Record<AvatarSize, string> = {
  xs: "size-6 text-caption",
  sm: "size-8 text-small",
  md: "size-10 text-body",
  lg: "size-14 text-h3",
};

/** Stable hash so the same person always gets the same plate colour. */
function hueOf(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) % 360;
  }
  return hash;
}

export function Avatar({ name, size = "md", src, className }: AvatarProps) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- avatars are
      // user-supplied at arbitrary origins; the optimiser adds nothing here.
      <img
        src={src}
        alt=""
        aria-hidden="true"
        className={cn(
          "shrink-0 rounded-full border border-line object-cover",
          SIZES[size],
          className,
        )}
      />
    );
  }

  const hue = hueOf(name);

  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid shrink-0 place-items-center rounded-full border border-line-soft font-semibold",
        SIZES[size],
        className,
      )}
      style={{
        background: `linear-gradient(140deg, oklch(0.32 0.09 ${hue}), oklch(0.24 0.06 ${hue}))`,
        color: `oklch(0.93 0.04 ${hue})`,
      }}
    >
      {initialsOf(name)}
    </span>
  );
}
