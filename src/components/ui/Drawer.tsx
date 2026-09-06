"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { useT } from "@/i18n/I18nProvider";
import { IconButton } from "./IconButton";
import {
  OVERLAY_SCRIM,
  Portal,
  useBodyScrollLock,
  useEscapeKey,
  useFocusTrap,
} from "./Modal";

export type DrawerSide = "start" | "end" | "bottom";

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  /** Logical edge: "end" is the right in French, the left in Arabic. */
  side?: DrawerSide;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  /**
   * `false` hands scrolling to the child.
   *
   * The default wrapper scrolls, which is right for prose. A child that has
   * its own fixed header/footer and internal scroller — the bet slip — would
   * otherwise sit inside a second scroller: two scrollbars, and the child's
   * "fixed" footer scrolling away with the rest of it.
   */
  scrollBody?: boolean;
  initialFocusRef?: RefObject<HTMLElement | null>;
  closeLabel?: string;
  className?: string;
}

const ALIGNMENT: Record<DrawerSide, string> = {
  start: "justify-start",
  end: "justify-end",
  bottom: "items-end justify-center",
};

const PANEL_SHAPE: Record<DrawerSide, string> = {
  start: "h-full w-full max-w-[380px] border-e",
  end: "h-full w-full max-w-[420px] border-s",
  bottom: "w-full max-h-[85dvh] min-h-[38dvh] rounded-t-2xl border-t",
};

export function Drawer({ open, ...props }: DrawerProps) {
  if (!open) return null;
  // Mounted inside the portal so the focus trap always sees a real panel node.
  return (
    <Portal>
      <DrawerSurface {...props} />
    </Portal>
  );
}

function DrawerSurface({
  onClose,
  side = "end",
  scrollBody = true,
  title,
  description,
  children,
  footer,
  initialFocusRef,
  closeLabel,
  className,
}: Omit<DrawerProps, "open">) {
  const t = useT();
  const panelRef = useRef<HTMLDivElement>(null);
  const baseId = useId();
  const titleId = `${baseId}-title`;
  const descriptionId = `${baseId}-description`;

  const [entered, setEntered] = useState(false);
  const [rtl, setRtl] = useState(false);

  useBodyScrollLock(true);
  useEscapeKey(true, onClose);
  useFocusTrap(panelRef, true, initialFocusRef);

  useEffect(() => {
    // `start`/`end` are logical, but a transform is not — resolve the edge
    // against the document direction so Arabic slides in from the left.
    setRtl((document.dir || document.documentElement.dir) === "rtl");

    // Two frames: the panel must paint in its offscreen position before the
    // transition to the resting position can be observed.
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setEntered(true));
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, []);

  const physicalSide: "left" | "right" | "bottom" =
    side === "bottom" ? "bottom" : (side === "end") !== rtl ? "right" : "left";

  const offscreen =
    physicalSide === "bottom"
      ? "translate-y-full"
      : physicalSide === "right"
        ? "translate-x-full"
        : "-translate-x-full";

  const onScrimMouseDown = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (event.target === event.currentTarget) onClose();
    },
    [onClose],
  );

  return (
    <>
      <div className={OVERLAY_SCRIM} aria-hidden="true" />
      <div
        className={cn("fixed inset-0 z-70 flex", ALIGNMENT[side])}
        onMouseDown={onScrimMouseDown}
      >
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={description ? descriptionId : undefined}
          tabIndex={-1}
          className={cn(
            "glass-panel edge-light flex flex-col border-line shadow-e4 outline-none",
            "transition-transform duration-slow ease-out-quint",
            PANEL_SHAPE[side],
            entered ? "translate-x-0 translate-y-0" : offscreen,
            className,
          )}
        >
          {side === "bottom" ? (
            <div className="flex justify-center pt-2.5" aria-hidden="true">
              <span className="h-1 w-10 rounded-full bg-line-strong" />
            </div>
          ) : null}

          <div className="flex items-start gap-4 border-b border-line-soft p-4 sm:p-5">
            <div className="min-w-0 flex-1 space-y-1">
              <h2 id={titleId} className="text-h3 text-ink">
                {title}
              </h2>
              {description ? (
                <p id={descriptionId} className="text-small text-ink-muted">
                  {description}
                </p>
              ) : null}
            </div>
            <IconButton
              label={closeLabel ?? t("ui.close")}
              icon={<X aria-hidden="true" />}
              size="sm"
              onClick={onClose}
            />
          </div>

          <div
            className={cn(
              "flex min-h-0 flex-1 flex-col",
              scrollBody
                ? "scroll-slim overflow-y-auto p-4 text-body text-ink-muted sm:p-5"
                : "overflow-hidden",
            )}
          >
            {children}
          </div>

          {footer ? (
            <div
              className={cn(
                "border-t border-line-soft bg-surface/60 p-4 sm:p-5",
                side === "bottom" && "safe-bottom",
              )}
            >
              {footer}
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
