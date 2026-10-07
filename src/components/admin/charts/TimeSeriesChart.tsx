"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Table2, LineChart as LineIcon } from "lucide-react";
import { formatAmount, formatDateTime, formatNumber } from "@/lib/format";
import { useI18n } from "@/i18n/I18nProvider";

export interface ChartSeries {
  key: string;
  label: string;
  /** CSS variable name, e.g. `--color-chart-1`. */
  color: string;
  values: number[];
}

export interface TimeSeriesChartProps {
  title: string;
  /** What the numbers are — "TND, gross" — so no figure floats free of its unit. */
  subtitle: string;
  /** ISO instants, one per bucket, in order. */
  starts: string[];
  bucket: "hour" | "day";
  series: ChartSeries[];
  kind: "line" | "bar";
  format: "money" | "count";
}

const HEIGHT = 220;
const PAD = { top: 12, right: 12, bottom: 26, left: 52 };

/** Round the top of the axis to a clean number (1, 2, 2.5, 5 × 10ⁿ) and pick ticks. */
function niceScale(max: number): { top: number; ticks: number[] } {
  if (max <= 0) return { top: 1, ticks: [0, 1] };
  const exponent = Math.floor(Math.log10(max));
  const base = 10 ** exponent;
  const fraction = max / base;
  const step = [1, 2, 2.5, 5, 10].find((candidate) => fraction <= candidate * 4) ?? 10;
  const unit = (step * base) / 2 >= max / 4 ? (step * base) / 2 : step * base;
  const ticks: number[] = [];
  for (let value = 0; value < max + unit; value += unit) ticks.push(Number(value.toFixed(6)));
  return { top: ticks[ticks.length - 1]!, ticks };
}

/**
 * A small, dependency-free time-series chart (SVG).
 *
 * Choices that follow the data-visualisation rules rather than taste: one y-axis
 * only (two measures of different scale are two charts); 2px lines and ≤24px bars
 * with a rounded data end; hairline solid gridlines; a legend whenever there are
 * two or more series, so identity is never colour alone; a crosshair tooltip on
 * hover and keyboard focus; and a table view of the same numbers for anyone who
 * cannot read a plot. Colours come from `--color-chart-*`, which are stepped
 * separately for the light and dark surfaces and validated for colour-vision
 * deficiency.
 */
export function TimeSeriesChart({
  title,
  subtitle,
  starts,
  bucket,
  series,
  kind,
  format,
}: TimeSeriesChartProps) {
  const { t, locale } = useI18n();
  const id = useId();
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [hover, setHover] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);

  useEffect(() => {
    const node = container.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.max(280, Math.floor(entry.contentRect.width)));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const count = starts.length;
  const max = useMemo(() => Math.max(0, ...series.flatMap((entry) => entry.values)), [series]);
  const { top, ticks } = useMemo(() => niceScale(max), [max]);
  const empty = max === 0;

  const innerW = width - PAD.left - PAD.right;
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const x = (index: number) =>
    kind === "bar"
      ? PAD.left + ((index + 0.5) / Math.max(count, 1)) * innerW
      : PAD.left + (count <= 1 ? innerW / 2 : (index / (count - 1)) * innerW);
  const y = (value: number) => PAD.top + innerH - (value / top) * innerH;

  const fmt = (value: number) =>
    format === "money" ? formatAmount(value, locale, { decimals: 2, withSymbol: false }) : formatNumber(value, locale);
  const tick = (value: number) =>
    format === "money" && value >= 1000
      ? `${formatNumber(value / 1000, locale, value % 1000 === 0 ? 0 : 1)}k`
      : formatNumber(value, locale, value < 10 && value % 1 ? 1 : 0);

  const labelAt = (iso: string) =>
    bucket === "hour"
      ? formatDateTime(iso, locale, { day: undefined, month: undefined, hour: "2-digit", minute: undefined })
      : formatDateTime(iso, locale, { hour: undefined, minute: undefined });

  // Show roughly one x label per 70px, always including the first.
  const every = Math.max(1, Math.ceil(count / Math.max(1, Math.floor(innerW / 70))));

  // Bars: a slot split between series, each ≤ 24px, 2px apart, never filling the slot.
  const slot = innerW / Math.max(count, 1);
  const barW = Math.min(24, Math.max(3, (slot * 0.7) / series.length - 2));

  const nearest = (clientX: number, rect: DOMRect) => {
    const px = clientX - rect.left - PAD.left;
    const index = kind === "bar" ? Math.floor(px / slot) : Math.round((px / innerW) * (count - 1));
    return Math.min(Math.max(index, 0), count - 1);
  };

  const tooltipLeft = hover === null ? 0 : Math.min(Math.max(x(hover), 90), width - 90);

  return (
    <figure className="rounded-xl border border-line bg-surface p-4 shadow-e1" aria-labelledby={`${id}-t`}>
      <figcaption className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 id={`${id}-t`} className="text-h3 text-ink">
            {title}
          </h3>
          <p className="text-caption normal-case tracking-normal text-ink-subtle">{subtitle}</p>
        </div>
        <button
          type="button"
          onClick={() => setAsTable((value) => !value)}
          aria-pressed={asTable}
          className="flex cursor-pointer items-center gap-1.5 rounded-md border border-line px-2 py-1 text-caption normal-case tracking-normal text-ink-muted transition-colors duration-fast hover:border-line-strong hover:text-ink"
        >
          {asTable ? <LineIcon size={12} aria-hidden="true" /> : <Table2 size={12} aria-hidden="true" />}
          {asTable ? t("admin.chart.viewChart") : t("admin.chart.viewTable")}
        </button>
      </figcaption>

      {series.length > 1 ? (
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1" aria-label={t("admin.chart.legend")}>
          {series.map((entry) => (
            <li key={entry.key} className="flex items-center gap-1.5 text-small text-ink-muted">
              <span
                aria-hidden="true"
                className="inline-block h-0.5 w-4 rounded-full"
                style={{ background: `var(${entry.color})`, height: kind === "bar" ? 8 : 2, width: kind === "bar" ? 8 : 16, borderRadius: kind === "bar" ? 2 : 999 }}
              />
              {entry.label}
            </li>
          ))}
        </ul>
      ) : null}

      <div ref={container} className="relative mt-3">
        {asTable ? (
          <div className="scroll-slim max-h-[220px] overflow-auto rounded-md border border-line-soft">
            <table className="w-full text-small">
              <thead className="sticky top-0 bg-surface-2 text-caption uppercase text-ink-subtle">
                <tr>
                  <th className="px-3 py-2 text-start font-medium">{t("admin.chart.period")}</th>
                  {series.map((entry) => (
                    <th key={entry.key} className="px-3 py-2 text-end font-medium">
                      {entry.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {starts.map((start, index) => (
                  <tr key={start} className="border-t border-line-soft">
                    <td className="numeric px-3 py-1.5 text-ink-muted">
                      {formatDateTime(start, locale, bucket === "hour" ? {} : { hour: undefined, minute: undefined })}
                    </td>
                    {series.map((entry) => (
                      <td key={entry.key} className="numeric px-3 py-1.5 text-end text-ink">
                        {fmt(entry.values[index] ?? 0)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <>
            <svg
              width={width}
              height={HEIGHT}
              role="img"
              aria-label={`${title}. ${subtitle}`}
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === "ArrowRight") setHover((value) => Math.min((value ?? -1) + 1, count - 1));
                if (event.key === "ArrowLeft") setHover((value) => Math.max((value ?? count) - 1, 0));
                if (event.key === "Escape") setHover(null);
              }}
              onBlur={() => setHover(null)}
              onMouseMove={(event) => setHover(nearest(event.clientX, event.currentTarget.getBoundingClientRect()))}
              onMouseLeave={() => setHover(null)}
              className="block max-w-full touch-pan-y outline-none focus-visible:ring-2 focus-visible:ring-primary-ring"
            >
              {ticks.map((value) => (
                <g key={value}>
                  <line
                    x1={PAD.left}
                    x2={width - PAD.right}
                    y1={y(value)}
                    y2={y(value)}
                    stroke="var(--color-line-soft)"
                    strokeWidth={1}
                  />
                  <text
                    x={PAD.left - 8}
                    y={y(value)}
                    textAnchor="end"
                    dominantBaseline="middle"
                    className="fill-ink-subtle"
                    fontSize={11}
                  >
                    {tick(value)}
                  </text>
                </g>
              ))}

              {starts.map((start, index) =>
                index % every === 0 ? (
                  <text
                    key={start}
                    x={x(index)}
                    y={HEIGHT - 8}
                    // The last label of a line chart sits on the right edge; centred, half of it is clipped.
                    textAnchor={kind === "line" && index === count - 1 ? "end" : "middle"}
                    className="fill-ink-subtle"
                    fontSize={11}
                  >
                    {labelAt(start)}
                  </text>
                ) : null,
              )}

              {kind === "line"
                ? series.map((entry) => (
                    <g key={entry.key}>
                      <path
                        d={`M ${x(0)} ${y(0)} ${entry.values.map((value, i) => `L ${x(i)} ${y(value)}`).join(" ")} L ${x(count - 1)} ${y(0)} Z`}
                        fill={`var(${entry.color})`}
                        opacity={0.1}
                      />
                      <path
                        d={entry.values.map((value, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(value)}`).join(" ")}
                        fill="none"
                        stroke={`var(${entry.color})`}
                        strokeWidth={2}
                        strokeLinejoin="round"
                        strokeLinecap="round"
                      />
                    </g>
                  ))
                : series.map((entry, seriesIndex) =>
                    entry.values.map((value, i) => {
                      if (value <= 0) return null;
                      const left = x(i) - (series.length * (barW + 2)) / 2 + seriesIndex * (barW + 2);
                      const barTop = y(value);
                      const radius = Math.min(4, barW / 2, y(0) - barTop);
                      return (
                        <path
                          key={`${entry.key}-${i}`}
                          // Rounded at the data end only; square on the baseline.
                          d={`M ${left} ${y(0)} V ${barTop + radius} Q ${left} ${barTop} ${left + radius} ${barTop} H ${left + barW - radius} Q ${left + barW} ${barTop} ${left + barW} ${barTop + radius} V ${y(0)} Z`}
                          fill={`var(${entry.color})`}
                          opacity={hover === null || hover === i ? 1 : 0.55}
                        />
                      );
                    }),
                  )}

              {hover !== null ? (
                <g pointerEvents="none">
                  <line
                    x1={x(hover)}
                    x2={x(hover)}
                    y1={PAD.top}
                    y2={PAD.top + innerH}
                    stroke="var(--color-line-strong)"
                    strokeWidth={1}
                  />
                  {kind === "line"
                    ? series.map((entry) => (
                        <circle
                          key={entry.key}
                          cx={x(hover)}
                          cy={y(entry.values[hover] ?? 0)}
                          r={4}
                          fill={`var(${entry.color})`}
                          stroke="var(--color-surface)"
                          strokeWidth={2}
                        />
                      ))
                    : null}
                </g>
              ) : null}
            </svg>

            {hover !== null ? (
              <div
                role="status"
                className="pointer-events-none absolute top-0 z-10 w-44 -translate-x-1/2 rounded-md border border-line bg-surface-2 p-2.5 shadow-e3"
                style={{ left: tooltipLeft }}
              >
                <p className="numeric text-caption normal-case tracking-normal text-ink-subtle">
                  {formatDateTime(starts[hover]!, locale, bucket === "hour" ? {} : { hour: undefined, minute: undefined })}
                </p>
                <ul className="mt-1.5 space-y-1">
                  {series.map((entry) => (
                    <li key={entry.key} className="flex items-center justify-between gap-3 text-small">
                      <span className="flex items-center gap-1.5 text-ink-muted">
                        <span
                          aria-hidden="true"
                          className="size-2 rounded-sm"
                          style={{ background: `var(${entry.color})` }}
                        />
                        {entry.label}
                      </span>
                      <span className="numeric font-semibold text-ink">{fmt(entry.values[hover] ?? 0)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {empty ? (
              <p className="pointer-events-none absolute inset-0 grid place-items-center text-small text-ink-subtle">
                {t("admin.chart.empty")}
              </p>
            ) : null}
          </>
        )}
      </div>
    </figure>
  );
}

