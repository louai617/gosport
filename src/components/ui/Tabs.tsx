"use client";

import {
  createContext,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ComponentPropsWithRef,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { cn } from "@/lib/cn";

interface TabsContextValue {
  value: string;
  onValueChange: (value: string) => void;
  baseId: string;
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabsContext(component: string): TabsContextValue {
  const context = useContext(TabsContext);
  if (!context) {
    throw new Error(`<${component}> must be rendered inside <Tabs>`);
  }
  return context;
}

const tabId = (base: string, value: string) => `${base}-tab-${value}`;
const panelId = (base: string, value: string) => `${base}-panel-${value}`;

export interface TabsProps extends ComponentPropsWithRef<"div"> {
  value: string;
  onValueChange: (value: string) => void;
}

export function Tabs({ value, onValueChange, className, ...props }: TabsProps) {
  const baseId = useId();
  const context = useMemo(
    () => ({ value, onValueChange, baseId }),
    [value, onValueChange, baseId],
  );

  return (
    <TabsContext.Provider value={context}>
      <div className={cn("flex flex-col", className)} {...props} />
    </TabsContext.Provider>
  );
}

export interface TabListProps extends ComponentPropsWithRef<"div"> {
  /** Accessible name for the tab set — required by the tabs pattern. */
  "aria-label": string;
}

export function TabList({ className, children, ...props }: TabListProps) {
  const { value } = useTabsContext("TabList");
  const listRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState<{ x: number; width: number } | null>(null);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;

    const measure = () => {
      const active = list.querySelector<HTMLElement>('[role="tab"][data-state="active"]');
      if (!active) {
        setIndicator(null);
        return;
      }
      // `offsetLeft` is always physical; convert it to an inline-start offset so
      // the same translate works in both directions.
      const rtl = getComputedStyle(list).direction === "rtl";
      const inlineStart = rtl
        ? list.scrollWidth - active.offsetLeft - active.offsetWidth
        : active.offsetLeft;
      setIndicator({ x: rtl ? -inlineStart : inlineStart, width: active.offsetWidth });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    return () => observer.disconnect();
  }, [value, children]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
    if (!keys.includes(event.key)) return;

    const tabs = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]:not([disabled])'),
    );
    if (tabs.length === 0) return;

    const current = tabs.findIndex((tab) => tab === document.activeElement);
    const rtl = getComputedStyle(event.currentTarget).direction === "rtl";

    let next: number;
    if (event.key === "Home") {
      next = 0;
    } else if (event.key === "End") {
      next = tabs.length - 1;
    } else {
      const forward = event.key === (rtl ? "ArrowLeft" : "ArrowRight");
      const from = current === -1 ? 0 : current;
      next = (from + (forward ? 1 : -1) + tabs.length) % tabs.length;
    }

    event.preventDefault();
    tabs[next]?.focus();
    tabs[next]?.click();
  };

  return (
    <div
      ref={listRef}
      role="tablist"
      onKeyDown={onKeyDown}
      className={cn(
        "relative flex items-stretch gap-1 border-b border-line",
        className,
      )}
      {...props}
    >
      {children}
      <span
        aria-hidden="true"
        style={indicator ? { width: indicator.width, transform: `translateX(${indicator.x}px)` } : undefined}
        className={cn(
          "pointer-events-none absolute bottom-0 start-0 h-0.5 rounded-full bg-primary",
          "transition-[transform,width] duration-base ease-out-quint",
          indicator ? "opacity-100" : "opacity-0",
        )}
      />
    </div>
  );
}

export interface TabProps extends Omit<ComponentPropsWithRef<"button">, "value"> {
  value: string;
  icon?: ReactNode;
  badge?: ReactNode;
}

export function Tab({ value, icon, badge, className, children, ...props }: TabProps) {
  const context = useTabsContext("Tab");
  const active = context.value === value;

  return (
    <button
      type="button"
      role="tab"
      id={tabId(context.baseId, value)}
      aria-selected={active}
      aria-controls={panelId(context.baseId, value)}
      data-state={active ? "active" : "inactive"}
      tabIndex={active ? 0 : -1}
      onClick={() => context.onValueChange(value)}
      className={cn(
        "inline-flex cursor-pointer items-center gap-2 whitespace-nowrap px-3 pb-2.5 pt-2",
        "text-small font-medium transition-colors duration-fast",
        "disabled:pointer-events-none disabled:opacity-55",
        active ? "text-ink" : "text-ink-muted hover:text-ink",
        "[&_svg]:size-4 [&_svg]:shrink-0",
        className,
      )}
      {...props}
    >
      {icon}
      {children}
      {badge}
    </button>
  );
}

export interface TabPanelProps extends ComponentPropsWithRef<"div"> {
  value: string;
}

export function TabPanel({ value, className, ...props }: TabPanelProps) {
  const context = useTabsContext("TabPanel");
  if (context.value !== value) return null;

  return (
    <div
      role="tabpanel"
      id={panelId(context.baseId, value)}
      aria-labelledby={tabId(context.baseId, value)}
      tabIndex={0}
      className={cn("animate-fade-in pt-4 outline-none", className)}
      {...props}
    />
  );
}
