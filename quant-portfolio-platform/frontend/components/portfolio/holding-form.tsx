"use client";

import { Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { Button, Field, NumberInput } from "@/components/ui";
import { money } from "@/lib/format";
import type { Asset } from "@/lib/types";

export type HoldingDraft = { ticker: string; quantity: number; average_cost: number; asset_type?: string | null; currency?: string; notes?: string | null };

/**
 * Manual holding entry (V2 addendum section 5). The user never types a current price:
 * quantity and average cost are theirs; the market price comes from the data pipeline.
 */
export function HoldingForm({
  assets,
  onAdd,
  existing,
  submitLabel = "Add holding",
  compact = false,
}: {
  assets: Asset[];
  onAdd: (h: HoldingDraft) => Promise<void> | void;
  existing: string[];
  submitLabel?: string;
  compact?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [ticker, setTicker] = useState("");
  const [quantity, setQuantity] = useState<number | "">("");
  const [cost, setCost] = useState<number | "">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const picked = assets.find((a) => a.ticker === ticker) ?? null;
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return assets.slice(0, 8);
    return assets.filter((a) => a.ticker.toLowerCase().includes(q) || a.name.toLowerCase().includes(q)).slice(0, 8);
  }, [assets, query]);

  const dup = picked && existing.includes(picked.ticker);
  const valid = !!picked && !dup && typeof quantity === "number" && quantity > 0 && typeof cost === "number" && cost > 0;

  function choose(a: Asset) {
    setTicker(a.ticker);
    setQuery(`${a.ticker} — ${a.name}`);
    setOpen(false);
    setError(null);
    if (cost === "") setCost(Number(a.last_price.toFixed(2)));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      await onAdd({ ticker: picked!.ticker, quantity: quantity as number, average_cost: cost as number, asset_type: picked!.asset_type });
      setTicker("");
      setQuery("");
      setQuantity("");
      setCost("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add that holding");
    } finally {
      setBusy(false);
    }
  }

  const invested = typeof quantity === "number" && typeof cost === "number" ? quantity * cost : null;
  const current = picked && typeof quantity === "number" ? quantity * picked.last_price : null;

  return (
    <form onSubmit={submit} className={compact ? "space-y-3" : "space-y-4"}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1.6fr_1fr_1fr]">
        <Field label="Ticker / asset" htmlFor="h-ticker" error={dup ? "Already in this portfolio — edit that row instead" : undefined}>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
            <input
              id="h-ticker"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setTicker("");
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              onBlur={() => window.setTimeout(() => setOpen(false), 150)}
              placeholder="Search NVDA, Apple, SPY…"
              autoComplete="off"
              className="input pl-9"
            />
            {open && matches.length > 0 ? (
              <ul className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-2xl bg-white/95 p-1 shadow-pop backdrop-blur-xl">
                {matches.map((a) => (
                  <li key={a.ticker}>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => choose(a)}
                      className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm hover:bg-black/[0.045]"
                    >
                      <span className="font-medium text-ink">{a.ticker}</span>
                      <span className="truncate text-xs text-ink-3">{a.name}</span>
                      <span className="num ml-auto pl-2 text-xs text-ink-2">{money(a.last_price, { cents: true })}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </Field>

        <Field label="Quantity" htmlFor="h-qty" hint={picked ? `Units of ${picked.ticker}` : "Shares or units"}>
          <NumberInput id="h-qty" value={quantity} onChange={setQuantity} min={0} step={0.0001} placeholder="5" />
        </Field>

        <Field label="Average buy price" htmlFor="h-cost" hint="Your cost basis per unit">
          <NumberInput id="h-cost" value={cost} onChange={setCost} min={0} step={0.01} suffix="USD" placeholder="170.00" />
        </Field>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-ink-3">
          {picked ? (
            <>
              Market price {money(picked.last_price, { cents: true })} (from the data pipeline, not entered by you)
              {invested !== null ? <> · invested {money(invested, { cents: true })}</> : null}
              {current !== null ? <> · current value {money(current, { cents: true })}</> : null}
            </>
          ) : (
            "Pick an asset from the list; the platform fetches its price."
          )}
        </p>
        <Button type="submit" size="sm" loading={busy} disabled={!valid}>
          <Plus className="h-4 w-4" />
          {submitLabel}
        </Button>
      </div>
      {error ? <p className="text-xs text-neg">{error}</p> : null}
    </form>
  );
}
