"use client";

import { CartesianGrid, Line, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";

import { axisPct, num, pct } from "@/lib/format";
import { AXIS, BENCH, ChartFrame, GRID, Legend, MUTED, SERIES, Tip } from "./base";

type Point = { volatility: number; expected_return: number; sharpe?: number | null; ticker?: string };

/**
 * Risk/return scatter: random feasible portfolios in the background, the efficient
 * frontier as a line, then the named portfolios. All-pairs colour safety keeps the
 * highlighted series to three hues (blue / orange / aqua).
 */
export function FrontierChart({
  frontier,
  random,
  assets,
  cml,
  markers,
  height = 380,
}: {
  frontier: Point[];
  random: Point[];
  assets: Point[];
  cml?: { volatility: number; expected_return: number }[];
  markers: { label: string; point: Point | null; color: string }[];
  height?: number;
}) {
  const shown = markers.filter((m) => m.point);
  return (
    <div>
      <ChartFrame height={height}>
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 10, right: 16, bottom: 28, left: 4 }}>
            <CartesianGrid stroke={GRID} />
            <XAxis
              type="number"
              dataKey="volatility"
              name="Volatility"
              tickFormatter={axisPct}
              stroke={AXIS}
              tick={{ fill: MUTED, fontSize: 11 }}
              tickLine={false}
              label={{ value: "Annualized volatility (risk)", position: "insideBottom", offset: -16, fill: MUTED, fontSize: 11 }}
            />
            <YAxis
              type="number"
              dataKey="expected_return"
              name="Expected return"
              tickFormatter={axisPct}
              stroke={AXIS}
              tick={{ fill: MUTED, fontSize: 11 }}
              tickLine={false}
              width={52}
            />
            <ZAxis range={[36, 36]} />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload as Point & { label?: string };
                return (
                  <Tip
                    title={d.label ?? d.ticker ?? "Portfolio"}
                    rows={[
                      { label: "Expected return", value: pct(d.expected_return, 2) },
                      { label: "Volatility", value: pct(d.volatility, 2) },
                      ...(d.sharpe !== undefined && d.sharpe !== null ? [{ label: "Sharpe", value: num(d.sharpe) }] : []),
                    ]}
                  />
                );
              }}
            />
            <Scatter name="Feasible portfolios" data={random} fill="#cdd3dc" shape="circle" isAnimationActive={false} />
            {cml?.length ? <Scatter name="Capital market line" data={cml} line={{ stroke: BENCH, strokeWidth: 1, strokeDasharray: "4 3" }} shape={() => <g />} isAnimationActive={false} /> : null}
            <Scatter name="Efficient frontier" data={frontier} line={{ stroke: SERIES[0], strokeWidth: 2 }} shape={() => <g />} isAnimationActive={false} />
            <Scatter name="Individual assets" data={assets} fill={MUTED} shape="diamond" isAnimationActive={false} />
            {shown.map((m) => (
              <Scatter key={m.label} name={m.label} data={[{ ...m.point!, label: m.label }]} fill={m.color} shape="star" isAnimationActive={false} />
            ))}
          </ScatterChart>
        </ResponsiveContainer>
      </ChartFrame>
      <Legend
        className="mt-2"
        items={[
          { label: "Efficient frontier", color: SERIES[0] },
          ...shown.map((m) => ({ label: m.label, color: m.color })),
          { label: "Individual assets", color: MUTED },
          { label: "Random feasible portfolios", color: "#cdd3dc" },
          ...(cml?.length ? [{ label: "Capital market line", color: BENCH, dashed: true }] : []),
        ]}
      />
    </div>
  );
}

/** Beta vs expected return scatter used on the risk page's factor section. */
export function AssetScatter({ data, height = 300 }: { data: { ticker: string; beta: number | null; expected_return: number }[]; height?: number }) {
  const rows = data.filter((d) => d.beta !== null);
  return (
    <ChartFrame height={height}>
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 10, right: 16, bottom: 28, left: 4 }}>
          <CartesianGrid stroke={GRID} />
          <XAxis
            type="number"
            dataKey="beta"
            stroke={AXIS}
            tick={{ fill: MUTED, fontSize: 11 }}
            tickLine={false}
            label={{ value: "Market beta", position: "insideBottom", offset: -16, fill: MUTED, fontSize: 11 }}
          />
          <YAxis type="number" dataKey="expected_return" tickFormatter={axisPct} stroke={AXIS} tick={{ fill: MUTED, fontSize: 11 }} tickLine={false} width={52} />
          <ZAxis range={[48, 48]} />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload as { ticker: string; beta: number; expected_return: number };
              return <Tip title={d.ticker} rows={[{ label: "Beta", value: num(d.beta) }, { label: "Expected return", value: pct(d.expected_return, 2) }]} />;
            }}
          />
          <Scatter data={rows} fill={SERIES[0]} isAnimationActive={false} />
        </ScatterChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export { Line };
