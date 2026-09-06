import type { ComponentPropsWithRef, ElementType, ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface CardProps extends ComponentPropsWithRef<"div"> {
  as?: ElementType;
  /** Lifts on hover — only for cards that are themselves a link or a button. */
  interactive?: boolean;
  elevated?: boolean;
  padded?: boolean;
}

export function Card({
  as = "div",
  interactive = false,
  elevated = false,
  padded = true,
  className,
  ...props
}: CardProps) {
  // `as` is deliberately loose so callers can pass "article", "section", "li".
  // The cast keeps ref and DOM props typed against the common element surface.
  const Component = as as "div";

  return (
    <Component
      className={cn(
        "edge-light relative rounded-xl border border-line bg-surface",
        elevated ? "shadow-e3" : "shadow-e2",
        padded && "p-4 sm:p-5",
        interactive &&
          "transition-[transform,box-shadow,border-color] duration-base ease-out-quint " +
            "hover:-translate-y-px hover:border-line-strong hover:shadow-e3",
        className,
      )}
      {...props}
    />
  );
}

export interface CardHeaderProps extends ComponentPropsWithRef<"div"> {
  /** Right-hand slot: a badge, a count, an overflow menu. */
  action?: ReactNode;
}

export function CardHeader({ action, className, children, ...props }: CardHeaderProps) {
  return (
    <div
      className={cn("flex items-start justify-between gap-3", className)}
      {...props}
    >
      <div className="min-w-0 space-y-1">{children}</div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export interface CardTitleProps extends ComponentPropsWithRef<"h3"> {
  as?: ElementType;
}

export function CardTitle({ as = "h3", className, ...props }: CardTitleProps) {
  const Component = as as "h3";
  return <Component className={cn("text-h3 text-ink", className)} {...props} />;
}

export type CardDescriptionProps = ComponentPropsWithRef<"p">;

export function CardDescription({ className, ...props }: CardDescriptionProps) {
  return <p className={cn("text-small text-ink-muted", className)} {...props} />;
}

export type CardContentProps = ComponentPropsWithRef<"div">;

export function CardContent({ className, ...props }: CardContentProps) {
  return <div className={cn("text-body text-ink-muted", className)} {...props} />;
}

export type CardFooterProps = ComponentPropsWithRef<"div">;

export function CardFooter({ className, ...props }: CardFooterProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 border-t border-line-soft pt-4",
        className,
      )}
      {...props}
    />
  );
}
