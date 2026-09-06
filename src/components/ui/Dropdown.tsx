"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/cn";

interface DropdownContextValue {
  close: () => void;
  registerItem: (node: HTMLElement | null) => void;
}

const DropdownContext = createContext<DropdownContextValue | null>(null);

export interface DropdownProps {
  trigger: ReactNode;
  children: ReactNode;
  align?: "start" | "end";
  /** Any width utility, e.g. "w-64". */
  width?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  label?: string;
  className?: string;
  panelClassName?: string;
}

/**
 * Menu-button pattern: ArrowDown opens and lands on the first item, arrows move
 * focus, Escape closes and returns focus to the trigger, and a click outside
 * dismisses. Positioning is CSS-only and direction-aware.
 */
export function Dropdown({
  trigger,
  children,
  align = "end",
  width = "w-56",
  open: controlledOpen,
  onOpenChange,
  label,
  className,
  panelClassName,
}: DropdownProps) {
  const id = useId();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;

  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemsRef = useRef<HTMLElement[]>([]);

  const setOpen = useCallback(
    (next: boolean) => {
      if (controlledOpen === undefined) setUncontrolledOpen(next);
      onOpenChange?.(next);
    },
    [controlledOpen, onOpenChange],
  );

  const close = useCallback(
    (returnFocus = true) => {
      setOpen(false);
      if (returnFocus) triggerRef.current?.focus();
    },
    [setOpen],
  );

  // Items register themselves on mount so arrow navigation follows DOM order
  // without the parent needing to know what was rendered.
  const registerItem = useCallback((node: HTMLElement | null) => {
    if (!node) return;
    if (!itemsRef.current.includes(node)) itemsRef.current.push(node);
  }, []);

  useEffect(() => {
    if (!open) itemsRef.current = [];
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, setOpen]);

  const focusItem = (index: number) => {
    const items = itemsRef.current.filter((node) => !node.hasAttribute("disabled"));
    if (items.length === 0) return;
    const target = items[(index + items.length) % items.length];
    target?.focus();
  };

  const onPanelKeyDown = (event: React.KeyboardEvent) => {
    const items = itemsRef.current.filter((node) => !node.hasAttribute("disabled"));
    const current = items.indexOf(document.activeElement as HTMLElement);

    if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      focusItem(current + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusItem(current - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusItem(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusItem(items.length - 1);
    } else if (event.key === "Tab") {
      close(false);
    }
  };

  const value = useMemo<DropdownContextValue>(
    () => ({ close: () => close(), registerItem }),
    [close, registerItem],
  );

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={label}
        onClick={() => setOpen(!open)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
            if (!open) {
              event.preventDefault();
              setOpen(true);
              requestAnimationFrame(() => focusItem(0));
            }
          }
        }}
        className="inline-flex cursor-pointer items-center rounded-md"
      >
        {trigger}
      </button>

      {open ? (
        <div
          id={id}
          role="menu"
          aria-label={label}
          onKeyDown={onPanelKeyDown}
          className={cn(
            "absolute top-[calc(100%+6px)] z-70 overflow-hidden rounded-lg border border-line bg-surface-2 p-1 shadow-e4 animate-slide-up",
            align === "end" ? "end-0" : "start-0",
            width,
            panelClassName,
          )}
        >
          <DropdownContext.Provider value={value}>{children}</DropdownContext.Provider>
        </div>
      ) : null}
    </div>
  );
}

export interface DropdownItemProps {
  children: ReactNode;
  onSelect?: () => void;
  href?: string;
  icon?: ReactNode;
  trailing?: ReactNode;
  active?: boolean;
  disabled?: boolean;
  tone?: "default" | "danger";
  className?: string;
}

export function DropdownItem({
  children,
  onSelect,
  href,
  icon,
  trailing,
  active = false,
  disabled = false,
  tone = "default",
  className,
}: DropdownItemProps) {
  const ctx = useContext(DropdownContext);

  const classes = cn(
    "flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-start text-small transition-colors duration-fast",
    tone === "danger" ? "text-danger hover:bg-danger-soft" : "text-ink-muted hover:bg-surface-3 hover:text-ink",
    active && tone === "default" && "bg-primary-soft text-primary",
    disabled && "pointer-events-none opacity-50",
    className,
  );

  const content = (
    <>
      {icon ? (
        <span aria-hidden="true" className="shrink-0">
          {icon}
        </span>
      ) : null}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {trailing ? <span className="shrink-0">{trailing}</span> : null}
    </>
  );

  const handle = () => {
    onSelect?.();
    ctx?.close();
  };

  if (href) {
    return (
      <a
        ref={ctx?.registerItem}
        role="menuitem"
        href={href}
        onClick={handle}
        aria-current={active ? "true" : undefined}
        className={classes}
      >
        {content}
      </a>
    );
  }

  return (
    <button
      ref={ctx?.registerItem}
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={handle}
      aria-current={active ? "true" : undefined}
      className={classes}
    >
      {content}
    </button>
  );
}

export function DropdownSeparator() {
  return <div role="separator" className="my-1 h-px bg-line-soft" />;
}

export function DropdownLabel({ children }: { children: ReactNode }) {
  return (
    <p className="px-2.5 pb-1 pt-2 text-caption uppercase text-ink-subtle">{children}</p>
  );
}
