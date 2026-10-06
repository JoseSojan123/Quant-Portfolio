"use client";

import { Area, AreaChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { axisPct, date, dateTickFormatter, money, pct } from "@/lib/format";
import { AXIS, BENCH, ChartFrame, GRID, Legend, MUTED, NEG, SERIES, Tip } from "./base";

type Row = Record<string, string | number | null>;

/** Value-over-time line chart with a crosshair tooltip. One y-axis, always. */
export function TimeSeries({
  data,
  xKey = "date",
  series,
  height = 300,
  format = "money",
  area = false,
  referenceY,
}: {
  data: Row[];
  xKey?: string;
  series: { key: string; label: string; color?: string; dashed?: boolean }[];
  height?: number;
  format?: "money" | "pct" | "plain";
  area?: boolean;
  referenceY?: number;
}) {
  const xTick = dateTickFormatter(data[0]?.[xKey], data[data.length - 1]?.[xKey]);
  const fmt = format === "money" ? (v: number) => money(v, { compact: true }) : format === "pct" ? (v: number) => pct(v, 1) : (v: number) => v.toFixed(2);
  const tipFmt = format === "money" ? (v: number) => money(v, { cents: Math.abs(v) < 1000 }) : format === "pct" ? (v: number) => pct(v, 2) : (v: number) => v.toFixed(3);
  const Chart = area ? AreaChart : LineChart;
  return (
    <div>
      <ChartFrame height={height}>
        <ResponsiveContainer width="100%" height="100%">
          <Chart data={data} margin={{ top: 8, right: 10, bottom: 4, left: 0 }}>
            <defs>
              {series.map((s, i) => (
                <linearGradient key={s.key} id={`g-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={s.color ?? SERIES[i % SERIES.length]} stopOpacity={0.16} />
                  <stop offset="100%" stopColor={s.color ?? SERIES[i % SERIES.length]} stopOpacity={0.01} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey={xKey} tickFormatter={xTick} stroke={AXIS} tick={{ fill: MUTED, fontSize: 11 }} tickLine={false} minTickGap={40} />
            <YAxis tickFormatter={fmt} stroke={AXIS} tick={{ fill: MUTED, fontSize: 11 }} tickLine={false} width={52} domain={format === "pct" ? ["auto", "auto"] : ["auto", "auto"]} />
            {referenceY !== undefined ? <ReferenceLine y={referenceY} stroke={AXIS} strokeDasharray="4 3" /> : null}
            <Tooltip
              cursor={{ stroke: AXIS, strokeWidth: 1 }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                return (
                  <Tip
                    title={date(String(label))}
                    rows={payload
                      .filter((p) => p.value !== null && p.value !== undefined)
                      .map((p) => ({
                        label: series.find((s) => s.key === p.dataKey)?.label ?? String(p.dataKey),
                        value: tipFmt(Number(p.value)),
                        color: String(p.stroke ?? p.color),
                      }))}
                  />
                );
              }}
            />
            {series.map((s, i) =>
              area ? (
                <Area
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  stroke={s.color ?? SERIES[i % SERIES.length]}
                  strokeWidth={2}
                  fill={`url(#g-${s.key})`}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2, stroke: "#ffffff" }}
                  connectNulls
                  isAnimationActive={false}
                  strokeDasharray={s.dashed ? "4 3" : undefined}
                />
              ) : (
                <Line
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  stroke={s.color ?? SERIES[i % SERIES.length]}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2, stroke: "#ffffff" }}
                  connectNulls
                  isAnimationActive={false}
                  strokeDasharray={s.dashed ? "4 3" : undefined}
                />
              ),
            )}
          </Chart>
        </ResponsiveContainer>
      </ChartFrame>
      {series.length > 1 ? (
        <Legend className="mt-2" items={series.map((s, i) => ({ label: s.label, color: s.color ?? SERIES[i % SERIES.length], dashed: s.dashed }))} />
      ) : null}
    </div>
  );
}

/** Underwater (drawdown) chart: always <= 0, filled down from zero. */
export function DrawdownChart({ data, height = 200, xKey = "date", valueKey = "drawdown" }: { data: Row[]; height?: number; xKey?: string; valueKey?: string }) {
  const xTick = dateTickFormatter(data[0]?.[xKey], data[data.length - 1]?.[xKey]);
  return (
    <ChartFrame height={height}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 10, bottom: 4, left: 0 }}>
          <defs>
            <linearGradient id="dd-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={NEG} stopOpacity={0.02} />
              <stop offset="100%" stopColor={NEG} stopOpacity={0.18} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey={xKey} tickFormatter={xTick} stroke={AXIS} tick={{ fill: MUTED, fontSize: 11 }} tickLine={false} minTickGap={40} />
          <YAxis tickFormatter={axisPct} stroke={AXIS} tick={{ fill: MUTED, fontSize: 11 }} tickLine={false} width={48} />
          <Tooltip
            cursor={{ stroke: AXIS, strokeWidth: 1 }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              return <Tip title={date(String(label))} rows={[{ label: "Drawdown", value: pct(Number(payload[0].value), 2) }]} />;
            }}
          />
          <Area type="monotone" dataKey={valueKey} stroke={NEG} strokeWidth={2} fill="url(#dd-grad)" dot={false} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

/** Percentile fan chart for Monte Carlo: median line over 5-95 and 25-75 bands. */
export function FanChart({
  bands,
  height = 320,
  initialValue,
  targetValue,
}: {
  bands: { day: number; p5: number; p25: number; p50: number; p75: number; p95: number }[];
  height?: number;
  initialValue: number;
  targetValue?: number | null;
}) {
  const rows = bands.map((b) => ({
    day: b.day,
    lo5: b.p5,
    band5: b.p95 - b.p5,
    lo25: b.p25,
    band25: b.p75 - b.p25,
    p50: b.p50,
    p5: b.p5,
    p95: b.p95,
    p25: b.p25,
    p75: b.p75,
  }));
  return (
    <div>
      <ChartFrame height={height}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={rows} margin={{ top: 8, right: 10, bottom: 4, left: 0 }}>
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey="day" stroke={AXIS} tick={{ fill: MUTED, fontSize: 11 }} tickLine={false} tickFormatter={(v) => `${v}d`} minTickGap={32} />
            <YAxis tickFormatter={(v) => money(v, { compact: true })} stroke={AXIS} tick={{ fill: MUTED, fontSize: 11 }} tickLine={false} width={56} />
            <ReferenceLine y={initialValue} stroke={BENCH} strokeDasharray="4 3" />
            {targetValue ? <ReferenceLine y={targetValue} stroke={SERIES[2]} strokeWidth={2} strokeDasharray="4 3" /> : null}
            <Tooltip
              cursor={{ stroke: AXIS, strokeWidth: 1 }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload as { p5: number; p25: number; p50: number; p75: number; p95: number };
                return (
                  <Tip
                    title={`Day ${label}`}
                    rows={[
                      { label: "95th percentile", value: money(d.p95) },
                      { label: "75th", value: money(d.p75) },
                      { label: "Median", value: money(d.p50), color: SERIES[0] },
                      { label: "25th", value: money(d.p25) },
                      { label: "5th percentile", value: money(d.p5) },
                    ]}
                  />
                );
              }}
            />
            <Area dataKey="lo5" stackId="b5" stroke="none" fill="transparent" isAnimationActive={false} />
            <Area dataKey="band5" stackId="b5" stroke="none" fill={SERIES[0]} fillOpacity={0.1} isAnimationActive={false} />
            <Area dataKey="lo25" stackId="b25" stroke="none" fill="transparent" isAnimationActive={false} />
            <Area dataKey="band25" stackId="b25" stroke="none" fill={SERIES[0]} fillOpacity={0.14} isAnimationActive={false} />
            <Area dataKey="p50" stroke={SERIES[0]} strokeWidth={2} fill="transparent" dot={false} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </ChartFrame>
      <Legend
        className="mt-2"
        items={[
          { label: "Median path", color: SERIES[0] },
          { label: "25th-75th percentile", color: "#9ec5f4" },
          { label: "5th-95th percentile", color: "#cde2fb" },
          { label: "Starting value", color: BENCH, dashed: true },
          ...(targetValue ? [{ label: `Target ${money(targetValue)}`, color: SERIES[2], dashed: true }] : []),
        ]}
      />
    </div>
  );
}

/**
 * A handful of individual simulated paths. They are anonymous draws, so they share one
 * hue rather than each taking a categorical color: identity carries no meaning here and
 * a 25-entry legend would only be noise. The x axis is trading days from today.
 */
export function SamplePaths({
  paths,
  days,
  initialValue,
  height = 240,
}: {
  paths: number[][];
  days: number[];
  initialValue: number;
  height?: number;
}) {
  const rows = days.map((d, i) => {
    const r: Record<string, number> = { day: d };
    paths.forEach((p, j) => {
      r[`p${j}`] = p[i];
    });
    return r;
  });
  return (
    <ChartFrame height={height}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 10, bottom: 4, left: 0 }}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="day" stroke={AXIS} tick={{ fill: MUTED, fontSize: 11 }} tickLine={false} tickFormatter={(v) => `${v}d`} minTickGap={32} />
          <YAxis tickFormatter={(v) => money(v, { compact: true })} stroke={AXIS} tick={{ fill: MUTED, fontSize: 11 }} tickLine={false} width={56} domain={["auto", "auto"]} />
          <ReferenceLine y={initialValue} stroke={BENCH} strokeDasharray="4 3" />
          {paths.map((_, j) => (
            <Line key={j} type="linear" dataKey={`p${j}`} stroke={SERIES[0]} strokeOpacity={0.45} strokeWidth={1.5} dot={false} isAnimationActive={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
