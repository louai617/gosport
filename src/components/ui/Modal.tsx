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
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { useT } from "@/i18n/I18nProvider";
import { IconButton } from "./IconButton";

/* -------------------------------------------------------------------------
   Overlay primitives.
   They live here rather than in a separate module because `Modal`, `Drawer`
   and `Toast` are the only consumers and they must behave identically.
   ---------------------------------------------------------------------- */

/** Renders into `document.body`, and nothing at all until the client mounts. */
export function Portal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function focusableWithin(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => element.offsetParent !== null || element === document.activeElement,
  );
}

/**
 * Keeps Tab inside `containerRef` while `active`, and returns focus to whatever
 * had it before the overlay opened.
 */
export function useFocusTrap(
  containerRef: RefObject<HTMLElement | null>,
  active: boolean,
  initialFocusRef?: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    // A frame of delay lets the entry animation start before focus moves, which
    // stops Safari from scrolling the panel while it is still translating.
    const frame = requestAnimationFrame(() => {
      const target = initialFocusRef?.current ?? focusableWithin(container)[0] ?? container;
      target.focus();
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const items = focusableWithin(container);
      if (items.length === 0) {
        event.preventDefault();
        container.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const current = document.activeElement;

      if (event.shiftKey && (current === first || !container.contains(current))) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && current === last) {
        event.preventDefault();
        first?.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown, true);
      previouslyFocused?.focus?.();
    };
  }, [active, containerRef, initialFocusRef]);
}

/** Locks page scroll and compensates for the scrollbar so nothing shifts. */
export function useBodyScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const { body } = document;
    const previousOverflow = body.style.overflow;
    const previousPadding = body.style.paddingInlineEnd;
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;

    body.style.overflow = "hidden";
    if (scrollbar > 0) body.style.paddingInlineEnd = `${scrollbar}px`;

    return () => {
      body.style.overflow = previousOverflow;
      body.style.paddingInlineEnd = previousPadding;
    };
  }, [active]);
}

export function useEscapeKey(active: boolean, onEscape: () => void): void {
  const handler = useRef(onEscape);
  handler.current = onEscape;

  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") handler.current();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [active]);
}

export const OVERLAY_SCRIM =
  "fixed inset-0 z-60 animate-fade-in bg-overlay/70 backdrop-blur-sm";

/* ----------------------------------------------------------------- Modal */

export type ModalSize = "sm" | "md" | "lg";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  size?: ModalSize;
  footer?: ReactNode;
  children: ReactNode;
  /** Focus this instead of the first focusable element — e.g. a "Cancel" button. */
  initialFocusRef?: RefObject<HTMLElement | null>;
  closeLabel?: string;
  className?: string;
}

const SIZES: Record<ModalSize, string> = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
};

export function Modal({ open, ...props }: ModalProps) {
  if (!open) return null;
  // The surface mounts only once the portal is live, so its focus-trap effect
  // always finds a real panel node to work with.
  return (
    <Portal>
      <ModalSurface {...props} />
    </Portal>
  );
}

function ModalSurface({
  onClose,
  title,
  description,
  size = "md",
  footer,
  children,
  initialFocusRef,
  closeLabel,
  className,
}: Omit<ModalProps, "open">) {
  const t = useT();
  const panelRef = useRef<HTMLDivElement>(null);
  const baseId = useId();
  const titleId = `${baseId}-title`;
  const descriptionId = `${baseId}-description`;

  useBodyScrollLock(true);
  useEscapeKey(true, onClose);
  useFocusTrap(panelRef, true, initialFocusRef);

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
        className="fixed inset-0 z-70 flex items-end justify-center overflow-y-auto p-4 sm:items-center"
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
            "edge-light my-auto w-full animate-slide-up rounded-xl border border-line",
            "bg-surface shadow-e4 outline-none",
            SIZES[size],
            className,
          )}
        >
          <div className="flex items-start gap-4 border-b border-line-soft p-5">
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

          <div className="scroll-slim max-h-[70dvh] overflow-y-auto p-5 text-body text-ink-muted">
            {children}
          </div>

          {footer ? (
            <div className="flex flex-wrap items-center justify-end gap-3 border-t border-line-soft p-5">
              {footer}
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
