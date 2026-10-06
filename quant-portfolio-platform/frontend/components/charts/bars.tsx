"use client";

import { Bar, BarChart, CartesianGrid, Cell, LabelList, Legend as RLegend, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { axisPct, money, pct } from "@/lib/format";
import { AXIS, CHANGE_DOWN, CHANGE_UP, ChartFrame, GRID, Legend, MUTED, NEG, POS, SERIES, Tip } from "./base";

type Row = Record<string, string | number | null>;

/** Grouped horizontal bars: capital weight vs risk contribution, or current vs target. */
export function GroupedBars({
  data,
  categoryKey,
  series,
  height,
  format = "pct",
}: {
  data: Row[];
  categoryKey: string;
  series: { key: string; label: string; color?: string }[];
  height?: number;
  format?: "pct" | "money";
}) {
  const fmt = format === "pct" ? (v: number) => pct(v, 1) : (v: number) => money(v);
  const h = height ?? Math.max(180, data.length * (series.length * 16 + 18) + 40);
  return (
    <div>
      <ChartFrame height={h}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 52, bottom: 4, left: 4 }} barGap={2}>
            <CartesianGrid horizontal={false} stroke={GRID} />
            <XAxis type="number" tickFormatter={format === "pct" ? axisPct : (v) => money(v, { compact: true })} stroke={AXIS} tick={{ fill: MUTED, fontSize: 11 }} tickLine={false} />
            <YAxis type="category" dataKey={categoryKey} width={62} stroke={AXIS} tick={{ fill: MUTED, fontSize: 11 }} tickLine={false} />
            <Tooltip
              cursor={{ fill: "rgba(15,23,42,0.04)" }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                return (
                  <Tip
                    title={String(label)}
                    rows={payload.map((p) => ({
                      label: series.find((s) => s.key === p.dataKey)?.label ?? String(p.dataKey),
                      value: fmt(Number(p.value)),
                      color: String(p.color),
                    }))}
                  />
                );
              }}
            />
            {series.map((s, i) => (
              <Bar key={s.key} dataKey={s.key} fill={s.color ?? SERIES[i % SERIES.length]} maxBarSize={14} radius={[0, 4, 4, 0]} isAnimationActive={false}>
                {i === series.length - 1 ? (
                  <LabelList dataKey={s.key} position="right" formatter={(v: unknown) => fmt(Number(v))} style={{ fill: MUTED, fontSize: 11 }} />
                ) : null}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </ChartFrame>
      <Legend className="mt-2" items={series.map((s, i) => ({ label: s.label, color: s.color ?? SERIES[i % SERIES.length] }))} />
    </div>
  );
}

/** 1, 2 or 5 times a power of ten: axis steps a reader can count in. */
function niceStep(raw: number): number {
  if (!(raw > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(raw));
  const f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}

/**
 * Single-series diverging bars around a zero baseline.
 *
 * `tone="pnl"` is for gains and losses: green up, red down. `tone="change"` is for
 * shifts that are neither good nor bad (weight changes, drift), so it uses a neutral
 * diverging pair and keeps green and red for money.
 */
export function DeltaBars({
  data,
  categoryKey,
  valueKey,
  height,
  format = "pct",
  upIsGood = true,
  tone = "pnl",
  valueLabel = "Change",
}: {
  data: Row[];
  categoryKey: string;
  valueKey: string;
  height?: number;
  format?: "pct" | "money";
  upIsGood?: boolean;
  tone?: "pnl" | "change";
  valueLabel?: string;
}) {
  const fmt = format === "pct" ? (v: number) => pct(v, 1, true) : (v: number) => money(v, { signed: true });
  const h = height ?? Math.max(170, data.length * 28 + 40);
  const values = data.map((d) => Number(d[valueKey] ?? 0));
  const lo = Math.min(0, ...values);
  const hi = Math.max(0, ...values);
  // Leave room past the longest bar on each side for its value label, so a label on a
  // long negative bar never runs into the category axis.
  const pad = (hi - lo || 1) * 0.18;
  const step = niceStep((hi - lo + 2 * pad) / 5);
  const domain: [number, number] = [lo < 0 ? Math.floor((lo - pad) / step) * step : 0, hi > 0 ? Math.ceil((hi + pad) / step) * step : 0];
  const ticks: number[] = [];
  for (let t = domain[0]; t <= domain[1] + step / 2; t += step) ticks.push(Math.round(t / step) * step);
  const up = tone === "pnl" ? POS : CHANGE_UP;
  const down = tone === "pnl" ? NEG : CHANGE_DOWN;
  return (
    <ChartFrame height={h}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 4 }}>
          <CartesianGrid horizontal={false} stroke={GRID} />
          <ReferenceLine x={0} stroke={AXIS} />
          <XAxis type="number" domain={domain} ticks={ticks} allowDataOverflow tickFormatter={format === "pct" ? axisPct : (v) => money(v, { compact: true })} stroke={AXIS} tick={{ fill: MUTED, fontSize: 11 }} tickLine={false} />
          <YAxis type="category" dataKey={categoryKey} width={62} stroke={AXIS} tick={{ fill: MUTED, fontSize: 11 }} tickLine={false} />
          <Tooltip
            cursor={{ fill: "rgba(15,23,42,0.04)" }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              return <Tip title={String(label)} rows={[{ label: valueLabel, value: fmt(Number(payload[0].value)) }]} />;
            }}
          />
          <Bar dataKey={valueKey} maxBarSize={16} radius={[0, 4, 4, 0]} isAnimationActive={false}>
            {data.map((d, i) => {
              const v = Number(d[valueKey] ?? 0);
              return <Cell key={i} fill={(v >= 0) === upIsGood ? up : down} />;
            })}
            <LabelList dataKey={valueKey} position="right" formatter={(v: unknown) => fmt(Number(v))} style={{ fill: MUTED, fontSize: 11 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

/** Histogram of a distribution (daily returns, simulated terminal values). */
export function Histogram({
  data,
  height = 220,
  xFormat = "pct",
  marker,
  markerLabel,
}: {
  data: { lo: number; hi: number; count: number }[];
  height?: number;
  xFormat?: "pct" | "money";
  marker?: number | null;
  markerLabel?: string;
}) {
  const rows = data.map((d) => ({ mid: (d.lo + d.hi) / 2, count: d.count, lo: d.lo, hi: d.hi }));
  const fmt = xFormat === "pct" ? (v: number) => pct(v, 1) : (v: number) => money(v, { compact: true });
  return (
    <div>
      <ChartFrame height={height}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey="mid" tickFormatter={fmt} stroke={AXIS} tick={{ fill: MUTED, fontSize: 11 }} tickLine={false} minTickGap={24} />
            <YAxis stroke={AXIS} tick={{ fill: MUTED, fontSize: 11 }} tickLine={false} width={44} />
            <Tooltip
              cursor={{ fill: "rgba(15,23,42,0.04)" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload as { lo: number; hi: number; count: number };
                return <Tip rows={[{ label: `${fmt(d.lo)} to ${fmt(d.hi)}`, value: `${d.count}` }]} />;
              }}
            />
            <Bar dataKey="count" isAnimationActive={false} radius={[2, 2, 0, 0]}>
              {rows.map((r, i) => (
                <Cell key={i} fill={marker !== undefined && marker !== null && r.hi <= marker ? NEG : SERIES[0]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartFrame>
      {marker !== undefined && marker !== null && markerLabel ? (
        <Legend className="mt-2" items={[{ label: markerLabel, color: NEG }, { label: "Other outcomes", color: SERIES[0] }]} />
      ) : null}
    </div>
  );
}

export { RLegend };
