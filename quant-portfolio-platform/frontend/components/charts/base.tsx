"use client";

import clsx from "clsx";
import { type ReactNode } from "react";

/** Categorical palette (dataviz reference instance), assigned in fixed order, never cycled. */
export const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"] as const;
export const GRID = "#efeff2";
export const AXIS = "#d2d2d7";
export const MUTED = "#8e8e93";
export const POS = "#1d7f3a";
export const NEG = "#d70015";
export const BENCH = "#8e8e93";
/** Neutral diverging pair for changes that are not gains or losses (weight shifts, drift). */
export const CHANGE_UP = "#2a78d6";
export const CHANGE_DOWN = "#eb6834";

/** Fixed hue per entity so a filter that changes the series count never repaints survivors. */
export function colorFor(key: string, keys: string[]): string {
  const i = keys.indexOf(key);
  return SERIES[(i < 0 ? 0 : i) % SERIES.length];
}

export const axisProps = {
  stroke: AXIS,
  tick: { fill: MUTED, fontSize: 11 },
  tickLine: false,
} as const;

/** Sequential blue ramp (one hue, light to dark) for magnitude encoding. */
export const BLUE_RAMP = ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"];
/** Diverging blue <-> red with a neutral gray midpoint, for polarity (e.g. correlation). */
export const DIVERGING = { negative: "#2a78d6", neutral: "#f0efec", positive: "#c42b2b" };

export function Tip({ title, rows, footer }: { title?: string; rows: { label: string; value: string; color?: string }[]; footer?: string }) {
  return (
    <div className="pointer-events-none rounded-xl bg-white/90 px-3 py-2.5 text-xs shadow-pop backdrop-blur-xl">
      {title ? <p className="mb-1 font-semibold text-ink">{title}</p> : null}
      <div className="space-y-0.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-2 whitespace-nowrap">
            {r.color ? <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: r.color }} /> : null}
            <span className="text-ink-2">{r.label}</span>
            <span className="num ml-auto pl-3 font-medium text-ink">{r.value}</span>
          </div>
        ))}
      </div>
      {footer ? <p className="mt-1.5 border-t border-hair pt-1.5 text-[11px] text-ink-3">{footer}</p> : null}
    </div>
  );
}

/** Legend built from text tokens with a colored key beside each label (never colored text). */
export function Legend({ items, className }: { items: { label: string; color: string; dashed?: boolean }[]; className?: string }) {
  return (
    <div className={clsx("flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-ink-2", className)}>
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          {i.dashed ? (
            <svg width="14" height="8" aria-hidden className="shrink-0">
              <line x1="0" y1="4" x2="14" y2="4" stroke={i.color} strokeWidth="2" strokeDasharray="4 3" />
            </svg>
          ) : (
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: i.color }} />
          )}
          {i.label}
        </span>
      ))}
    </div>
  );
}

/** Chart frame: title row, fixed-height responsive plot area, optional table view beneath. */
export function ChartFrame({ height = 280, children, className }: { height?: number; children: ReactNode; className?: string }) {
  return (
    <div className={clsx("w-full", className)} style={{ height }}>
      {children}
    </div>
  );
}
