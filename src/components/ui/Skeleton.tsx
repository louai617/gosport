import type { ComponentPropsWithRef } from "react";
import { cn } from "@/lib/cn";

export interface SkeletonProps extends ComponentPropsWithRef<"div"> {
  rounded?: "sm" | "md" | "lg" | "xl" | "full";
}

const ROUNDED = {
  sm: "rounded-sm",
  md: "rounded-md",
  lg: "rounded-lg",
  xl: "rounded-xl",
  full: "rounded-full",
} as const;

export function Skeleton({ rounded = "md", className, ...props }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn("skeleton", ROUNDED[rounded], className)}
      {...props}
    />
  );
}

export interface SkeletonTextProps extends ComponentPropsWithRef<"div"> {
  lines?: number;
}

/** Last line is short, which is what real wrapped text looks like. */
export function SkeletonText({ lines = 3, className, ...props }: SkeletonTextProps) {
  return (
    <div className={cn("flex flex-col gap-2", className)} {...props}>
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton
          key={index}
          rounded="sm"
          className={cn("h-3", index === lines - 1 ? "w-2/5" : "w-full")}
        />
      ))}
    </div>
  );
}

export function SkeletonCard({ className, ...props }: ComponentPropsWithRef<"div">) {
  return (
    <div
      className={cn(
        "rounded-xl border border-line bg-surface p-4 shadow-e2",
        className,
      )}
      {...props}
    >
      <div className="flex items-center gap-3">
        <Skeleton rounded="lg" className="size-9 shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton rounded="sm" className="h-3 w-1/3" />
          <Skeleton rounded="sm" className="h-3 w-1/2" />
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <Skeleton className="h-11" />
        <Skeleton className="h-11" />
        <Skeleton className="h-11" />
      </div>
    </div>
  );
}
