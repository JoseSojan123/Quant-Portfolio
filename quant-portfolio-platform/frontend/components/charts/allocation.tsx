"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { money, pct } from "@/lib/format";
import { ChartFrame, Legend, SERIES, Tip } from "./base";

export type Slice = { name: string; weight: number; value?: number | null };

/** Muted grays for entities past the eighth: the palette is never cycled, so a ninth
 * holding gets a neutral slice (still named in the legend and tooltip) rather than a
 * second copy of the first holding's blue. */
const OVERFLOW = ["#9aa0a8", "#b9bec5", "#7d838c", "#cfd3d8"];

function sliceColor(name: string, keys: string[]): string {
  const i = keys.indexOf(name);
  if (i >= 0 && i < SERIES.length) return SERIES[i];
  return OVERFLOW[Math.max(0, i - SERIES.length) % OVERFLOW.length];
}

/**
 * Donut for "what do I own". Weights are labeled in the legend, so identity is never color-alone.
 *
 * Pass `colorKeys` when two donuts sit side by side (current vs optimized) so each ticker
 * keeps one color across both, instead of colors following rank within each chart.
 */
export function AllocationDonut({
  data,
  height = 240,
  centerLabel,
  centerValue,
  colorKeys,
}: {
  data: Slice[];
  height?: number;
  centerLabel?: string;
  centerValue?: string;
  colorKeys?: string[];
}) {
  const rows = [...data].filter((d) => d.weight > 0.0005).sort((a, b) => b.weight - a.weight);
  const keys = colorKeys ?? rows.map((r) => r.name);
  return (
    <div>
      <div className="relative">
        <ChartFrame height={height}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={rows} dataKey="weight" nameKey="name" innerRadius="62%" outerRadius="94%" paddingAngle={2} stroke="#ffffff" strokeWidth={2} isAnimationActive={false}>
                {rows.map((r) => (
                  <Cell key={r.name} fill={sliceColor(r.name, keys)} />
                ))}
              </Pie>
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload as Slice;
                  return (
                    <Tip
                      title={d.name}
                      rows={[
                        { label: "Weight", value: pct(d.weight) },
                        ...(d.value !== undefined && d.value !== null ? [{ label: "Value", value: money(d.value) }] : []),
                      ]}
                    />
                  );
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </ChartFrame>
        {centerValue ? (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xs text-ink-3">{centerLabel}</span>
            <span className="num text-lg font-semibold text-ink">{centerValue}</span>
          </div>
        ) : null}
      </div>
      <Legend className="mt-3 justify-center" items={rows.map((r) => ({ label: `${r.name} ${pct(r.weight, 1)}`, color: sliceColor(r.name, keys) }))} />
    </div>
  );
}
