"use client";

import { useState } from "react";

import { num } from "@/lib/format";
import { DIVERGING } from "./base";

/**
 * Correlation heatmap. Diverging blue <-> red with a neutral gray midpoint: blue means
 * "moves oppositely" (diversifying), red means "moves together". Every cell also shows
 * its number, so colour never carries the value alone.
 */
export function CorrelationHeatmap({ tickers, matrix }: { tickers: string[]; matrix: number[][] }) {
  const [hover, setHover] = useState<{ i: number; j: number } | null>(null);
  const cell = (v: number) => {
    const t = Math.max(-1, Math.min(1, v));
    if (t >= 0) {
      const p = t;
      return mix(DIVERGING.neutral, DIVERGING.positive, p);
    }
    return mix(DIVERGING.neutral, DIVERGING.negative, -t);
  };
  return (
    <div className="overflow-x-auto">
      <table className="num border-separate border-spacing-0.5 text-[11px]" role="grid" aria-label="Correlation matrix">
        <thead>
          <tr>
            <th scope="col" className="sticky left-0 z-10 bg-white px-1.5 py-1" />
            {tickers.map((t) => (
              <th key={t} scope="col" className="px-1.5 py-1 font-medium text-ink-3">
                {t}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tickers.map((rowT, i) => (
            <tr key={rowT}>
              <th scope="row" className="sticky left-0 z-10 bg-white px-1.5 py-1 text-right font-medium text-ink-3">
                {rowT}
              </th>
              {tickers.map((colT, j) => {
                const v = matrix[i]?.[j] ?? 0;
                const active = hover && (hover.i === i || hover.j === j);
                return (
                  <td
                    key={colT}
                    onMouseEnter={() => setHover({ i, j })}
                    onMouseLeave={() => setHover(null)}
                    title={`${rowT} vs ${colT}: ${num(v)}`}
                    className="min-w-[42px] rounded px-1.5 py-1.5 text-center font-medium text-ink transition"
                    style={{ background: cell(v), outline: active ? "1px solid rgba(15,23,42,0.25)" : undefined }}
                  >
                    {i === j ? "1.00" : num(v)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-ink-2">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-6 rounded" style={{ background: DIVERGING.negative }} />
          -1.0 moves oppositely
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-6 rounded border border-line" style={{ background: DIVERGING.neutral }} />
          0.0 unrelated
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-6 rounded" style={{ background: DIVERGING.positive }} />
          +1.0 moves together
        </span>
      </div>
    </div>
  );
}

function mix(a: string, b: string, t: number): string {
  const pa = hex(a);
  const pb = hex(b);
  const c = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

function hex(h: string): number[] {
  const s = h.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16));
}
