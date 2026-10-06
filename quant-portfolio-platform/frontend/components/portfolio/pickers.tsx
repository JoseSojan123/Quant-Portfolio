"use client";

import clsx from "clsx";
import { Check, Search, X } from "lucide-react";
import { useMemo, useState } from "react";

import { Badge, Button, EmptyState } from "@/components/ui";
import { money, pct } from "@/lib/format";
import type { Asset } from "@/lib/types";

/** Searchable asset picker used by the builder, what-if and optimization universe. */
export function AssetSelector({
  assets,
  selected,
  onChange,
  max = 40,
  excludeBenchmark = false,
}: {
  assets: Asset[];
  selected: string[];
  onChange: (next: string[]) => void;
  max?: number;
  excludeBenchmark?: boolean;
}) {
  const [q, setQ] = useState("");
  const [sector, setSector] = useState("All");
  const sectors = useMemo(() => ["All", ...Array.from(new Set(assets.map((a) => a.sector))).sort()], [assets]);
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return assets
      .filter((a) => (excludeBenchmark ? !a.is_benchmark : true))
      .filter((a) => (sector === "All" ? true : a.sector === sector))
      .filter((a) => !needle || a.ticker.toLowerCase().includes(needle) || a.name.toLowerCase().includes(needle));
  }, [assets, q, sector, excludeBenchmark]);

  const toggle = (t: string) => {
    if (selected.includes(t)) onChange(selected.filter((x) => x !== t));
    else if (selected.length < max) onChange([...selected, t]);
  };

  return (
    <div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search ticker or name"
            aria-label="Search assets"
            className="input pl-9"
          />
        </div>
        <select value={sector} onChange={(e) => setSector(e.target.value)} aria-label="Filter by sector" className="input sm:w-48">
          {sectors.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </div>

      {selected.length ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {selected.map((t) => (
            <button key={t} onClick={() => toggle(t)} className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700 hover:bg-brand-100">
              {t}
              <X className="h-3 w-3" />
            </button>
          ))}
          <button onClick={() => onChange([])} className="px-1.5 text-xs text-ink-3 underline hover:text-ink">
            Clear
          </button>
        </div>
      ) : null}

      <div className="mt-3 max-h-80 overflow-y-auto rounded-2xl border border-hair">
        {list.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-ink-3">No assets match that search.</p>
        ) : (
          <ul className="divide-y divide-line/70">
            {list.map((a) => {
              const on = selected.includes(a.ticker);
              const full = !on && selected.length >= max;
              return (
                <li key={a.ticker}>
                  <button
                    onClick={() => toggle(a.ticker)}
                    disabled={full}
                    className={clsx("flex w-full items-center gap-3 px-3 py-2.5 text-left transition", on ? "bg-brand-50/60" : "hover:bg-black/[0.045]", full && "opacity-40")}
                  >
                    <span className={clsx("flex h-4 w-4 shrink-0 items-center justify-center rounded border", on ? "border-brand-600 bg-brand-600" : "border-line bg-white")}>
                      {on ? <Check className="h-3 w-3 text-white" /> : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2">
                        <span className="text-sm font-medium text-ink">{a.ticker}</span>
                        <span className="truncate text-xs text-ink-3">{a.name}</span>
                      </span>
                      <span className="text-xs text-ink-3">
                        {a.sector} · {a.asset_type}
                      </span>
                    </span>
                    <span className="num shrink-0 text-right text-xs">
                      <span className="block font-medium text-ink">{money(a.last_price, { cents: true })}</span>
                      <span className="block text-ink-3">vol {pct(a.volatility_1y, 0)}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <p className="mt-2 text-xs text-ink-3">
        {selected.length} of {max} selected
      </p>
    </div>
  );
}

export function NoPortfolio({ action = true }: { action?: boolean }) {
  return (
    <div className="card">
      <EmptyState
        title="No portfolio yet"
        body="Create a portfolio and add the holdings you own. Every analysis on this platform runs on your own positions."
        action={action ? <Button onClick={() => (window.location.href = "/onboarding")}>Create a portfolio</Button> : undefined}
      />
    </div>
  );
}

export { Badge };
