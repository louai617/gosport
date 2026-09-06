"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { useT } from "@/i18n/I18nProvider";
import { Portal } from "./Modal";

export type ToastTone = "neutral" | "success" | "warning" | "danger" | "info";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  title: string;
  description?: string;
  tone?: ToastTone;
  /** Milliseconds; `0` keeps the toast up until it is dismissed. */
  duration?: number;
  action?: ToastAction;
}

export interface ToastRecord extends ToastOptions {
  id: string;
}

export interface ToastContextValue {
  toast: (options: ToastOptions) => string;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const MAX_VISIBLE = 3;
const DEFAULT_DURATION = 4000;

let sequence = 0;

const TONE_ICON: Record<ToastTone, ReactNode> = {
  neutral: <Info aria-hidden="true" className="text-ink-subtle" />,
  success: <CircleCheck aria-hidden="true" className="text-success" />,
  warning: <TriangleAlert aria-hidden="true" className="text-warning" />,
  danger: <CircleAlert aria-hidden="true" className="text-danger" />,
  info: <Info aria-hidden="true" className="text-info" />,
};

const TONE_RAIL: Record<ToastTone, string> = {
  neutral: "border-s-line-strong",
  success: "border-s-success",
  warning: "border-s-warning",
  danger: "border-s-danger",
  info: "border-s-info",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback((options: ToastOptions) => {
    sequence += 1;
    const id = `toast-${sequence}`;
    // Oldest toasts fall off the top: three is the most a viewport can carry
    // before it starts hiding the page it is describing.
    setToasts((current) => [...current, { ...options, id }].slice(-MAX_VISIBLE));
    return id;
  }, []);

  const value = useMemo<ToastContextValue>(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Portal>
        <div
          role="status"
          aria-live="polite"
          className={cn(
            "pointer-events-none fixed z-90 flex flex-col gap-2 px-4",
            "inset-x-0 top-3 items-center",
            "sm:inset-x-auto sm:bottom-4 sm:end-4 sm:top-auto sm:items-end sm:px-0",
          )}
        >
          {toasts.map((item) => (
            <ToastItem key={item.id} toast={item} onDismiss={dismiss} />
          ))}
        </div>
      </Portal>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used inside <ToastProvider>");
  }
  return context;
}

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: ToastRecord;
  onDismiss: (id: string) => void;
}) {
  const t = useT();
  const tone = toast.tone ?? "neutral";
  const [paused, setPaused] = useState(false);

  // Remaining time survives pauses, so hovering does not restart the countdown.
  const remaining = useRef(toast.duration ?? DEFAULT_DURATION);
  const startedAt = useRef(0);

  useEffect(() => {
    if (paused || remaining.current <= 0) return;
    startedAt.current = Date.now();
    const timer = window.setTimeout(() => onDismiss(toast.id), remaining.current);
    return () => {
      window.clearTimeout(timer);
      remaining.current -= Date.now() - startedAt.current;
    };
  }, [paused, toast.id, onDismiss]);

  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      className={cn(
        "pointer-events-auto w-full max-w-sm animate-slide-in-end",
        "edge-light flex items-start gap-3 rounded-lg border border-s-2 border-line",
        "bg-surface-2 p-3 shadow-e3",
        TONE_RAIL[tone],
      )}
    >
      <span className="mt-0.5 shrink-0 [&_svg]:size-[18px]">{TONE_ICON[tone]}</span>

      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-small font-semibold text-ink">{toast.title}</p>
        {toast.description ? (
          <p className="text-small text-ink-muted">{toast.description}</p>
        ) : null}
        {toast.action ? (
          <button
            type="button"
            onClick={() => {
              toast.action?.onClick();
              onDismiss(toast.id);
            }}
            className="cursor-pointer pt-0.5 text-small font-semibold text-primary transition-colors duration-fast hover:text-primary-hover"
          >
            {toast.action.label}
          </button>
        ) : null}
      </div>

      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label={t("ui.close")}
        className="-me-1 -mt-1 inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-sm text-ink-subtle transition-colors duration-fast hover:bg-surface-3 hover:text-ink"
      >
        <X aria-hidden="true" className="size-4" />
      </button>
    </div>
  );
}
