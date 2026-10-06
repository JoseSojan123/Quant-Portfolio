"use client";

import { Check, Pencil, Plus, Star, Trash2, X } from "lucide-react";
import { useState } from "react";
import useSWR from "swr";

import { AllocationDonut } from "@/components/charts/allocation";
import { SERIES } from "@/components/charts/base";
import { PageHeader } from "@/components/layout/page-header";
import { HoldingForm } from "@/components/portfolio/holding-form";
import { NoPortfolio } from "@/components/portfolio/pickers";
import { Alert, Badge, Button, Card, CardHead, Field, NumberInput, Skeleton, Stat, StatRow } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { money, pct, qty, tone } from "@/lib/format";
import { usePortfolios } from "@/lib/portfolio-context";
import type { Asset, Holding, PortfolioDetail } from "@/lib/types";

export default function HoldingsPage() {
  const { activeId, loading, reload, setActiveId } = usePortfolios();
  const { refresh } = useAuth();
  const { data: assets } = useSWR<Asset[]>("/assets");
  const { data, error, mutate, isLoading } = useSWR<PortfolioDetail>(activeId ? `/portfolios/${activeId}` : null);

  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPortfolio, setNewPortfolio] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  if (loading || (isLoading && !data)) return <Skeleton className="h-72" />;
  if (!activeId) return <NoPortfolio />;
  if (error) return <Alert kind="error">{errorMessage(error)}</Alert>;
  if (!data || !assets) return <Skeleton className="h-72" />;

  const v = data.valuation;

  async function run<T>(fn: () => Promise<T>, success?: string) {
    setErr(null);
    setMsg(null);
    try {
      await fn();
      await mutate();
      reload();
      if (success) setMsg(success);
    } catch (e) {
      setErr(errorMessage(e));
    }
  }

  return (
    <>
      <PageHeader title="Holdings" subtitle="Add, edit or remove positions. Market prices come from the data pipeline; you supply quantity and cost basis.">
        <Button variant="secondary" size="sm" onClick={() => setNewPortfolio((v2) => !v2)}>
          New portfolio
        </Button>
        <Button size="sm" onClick={() => setAdding((v2) => !v2)}>
          <Plus className="h-4 w-4" /> Add holding
        </Button>
      </PageHeader>

      {msg ? (
        <div className="mb-4">
          <Alert kind="success" onClose={() => setMsg(null)}>
            {msg}
          </Alert>
        </div>
      ) : null}
      {err ? (
        <div className="mb-4">
          <Alert kind="error" onClose={() => setErr(null)}>
            {err}
          </Alert>
        </div>
      ) : null}
      {v.unpriced.length ? (
        <div className="mb-4">
          <Alert kind="warning" title="Some holdings have no market data">
            {v.unpriced.join(", ")} could not be priced, so they are excluded from analytics. Remove or replace them.
          </Alert>
        </div>
      ) : null}

      {newPortfolio ? (
        <Card className="mb-5">
          <CardHead title="Create another portfolio" subtitle="Useful for comparing a real account against a what-if allocation." />
          <div className="card-pad">
            <NewPortfolioForm
              onDone={async (id) => {
                setNewPortfolio(false);
                await refresh();
                reload();
                setActiveId(id);
              }}
            />
          </div>
        </Card>
      ) : null}

      {adding ? (
        <Card className="mb-5">
          <CardHead title="Add a holding" right={<Button variant="ghost" size="sm" onClick={() => setAdding(false)}>Close</Button>} />
          <div className="card-pad">
            <HoldingForm
              assets={assets}
              existing={v.holdings.map((h) => h.ticker)}
              onAdd={(h) => run(() => api(`/portfolios/${activeId}/holdings`, { body: h }), `${h.ticker} added`)}
            />
          </div>
        </Card>
      ) : null}

      <Card className="mb-5 card-pad">
        <StatRow cols={4}>
          <Stat label="Current value" value={money(v.current_value)} size="lg" />
          <Stat label="Invested" value={money(v.invested_value)} />
          <Stat label="Unrealized P&L" value={money(v.unrealized_pnl, { signed: true })} hint={pct(v.total_return, 1, true) + " total return"} />
          <Stat label="Today" value={money(v.day_change, { signed: true })} hint={pct(v.day_change_pct, 2, true)} />
        </StatRow>
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHead
            title={data.name}
            subtitle={`${v.holdings.length} holdings · priced ${v.price_date}`}
            right={
              <div className="flex items-center gap-2">
                {data.is_default ? (
                  <Badge kind="brand">
                    <Star className="h-3 w-3" /> Default
                  </Badge>
                ) : (
                  <Button variant="ghost" size="sm" onClick={() => run(() => api(`/portfolios/${activeId}/default`, { method: "POST" }).then(refresh), "Default portfolio updated")}>
                    Make default
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setRenaming(true);
                    setNewName(data.name);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" /> Rename
                </Button>
              </div>
            }
          />
          {renaming ? (
            <div className="flex flex-wrap items-end gap-2 border-b border-hair px-5 py-3.5 sm:px-6">
              <div className="min-w-[200px] flex-1">
                <Field label="Portfolio name" htmlFor="rename">
                  <input id="rename" value={newName} onChange={(e) => setNewName(e.target.value)} className="input" maxLength={120} />
                </Field>
              </div>
              <Button
                size="sm"
                onClick={() =>
                  run(async () => {
                    await api(`/portfolios/${activeId}`, { method: "PATCH", body: { name: newName } });
                    setRenaming(false);
                  }, "Renamed")
                }
              >
                Save
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setRenaming(false)}>
                Cancel
              </Button>
            </div>
          ) : null}

          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th scope="col">Ticker</th>
                  <th scope="col" className="text-right">Quantity</th>
                  <th scope="col" className="text-right">Avg cost</th>
                  <th scope="col" className="text-right">Price</th>
                  <th scope="col" className="text-right">Value</th>
                  <th scope="col" className="text-right">Weight</th>
                  <th scope="col" className="text-right">P&amp;L</th>
                  <th scope="col" />
                </tr>
              </thead>
              <tbody>
                {v.holdings.map((h) =>
                  editing === h.id ? (
                    <EditRow
                      key={h.id}
                      holding={h}
                      onCancel={() => setEditing(null)}
                      onSave={(body) =>
                        run(async () => {
                          await api(`/portfolios/${activeId}/holdings/${h.id}`, { method: "PATCH", body });
                          setEditing(null);
                        }, `${h.ticker} updated`)
                      }
                    />
                  ) : (
                    <tr key={h.id}>
                      <td>
                        <span className="font-medium">{h.ticker}</span>
                        <span className="block text-xs text-ink-3">{h.sector}</span>
                      </td>
                      <td className="num text-right">{qty(h.quantity)}</td>
                      <td className="num text-right">{money(h.average_cost, { cents: true })}</td>
                      <td className="num text-right">{money(h.current_price, { cents: true })}</td>
                      <td className="num text-right font-medium">{money(h.current_value)}</td>
                      <td className="num text-right">{pct(h.weight, 1)}</td>
                      <td className={`num text-right font-medium ${tone(h.unrealized_pnl)}`}>
                        {money(h.unrealized_pnl, { signed: true })}
                        <span className="block text-xs font-normal">{pct(h.unrealized_pnl_pct, 1, true)}</span>
                      </td>
                      <td>
                        <div className="flex justify-end gap-1">
                          <button onClick={() => setEditing(h.id)} aria-label={`Edit ${h.ticker}`} className="rounded-full p-1.5 text-ink-3 hover:bg-black/[0.045] hover:text-ink">
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => {
                              if (window.confirm(`Remove ${h.ticker} from this portfolio?`))
                                void run(() => api(`/portfolios/${activeId}/holdings/${h.id}`, { method: "DELETE" }), `${h.ticker} removed`);
                            }}
                            aria-label={`Remove ${h.ticker}`}
                            className="rounded-full p-1.5 text-ink-3 hover:bg-neg-soft hover:text-neg"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="space-y-5">
          <Card className="card-pad">
            <p className="text-sm font-semibold text-ink">Allocation</p>
            <div className="mt-3">
              <AllocationDonut data={v.holdings.map((h) => ({ name: h.ticker, weight: h.weight, value: h.current_value }))} height={210} />
            </div>
          </Card>

          <Card>
            <CardHead title="By sector" />
            <div className="card-pad">
              <ul className="space-y-2">
                {Object.entries(
                  v.holdings.reduce<Record<string, number>>((acc, h) => {
                    acc[h.sector] = (acc[h.sector] ?? 0) + h.weight;
                    return acc;
                  }, {}),
                )
                  .sort((a, b) => b[1] - a[1])
                  .map(([s, w], i) => (
                    <li key={s} className="flex items-center gap-2 text-xs">
                      <span className="w-28 shrink-0 truncate text-ink-2">{s}</span>
                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-black/[0.05]">
                        <span className="block h-full rounded-full" style={{ width: `${Math.max(w * 100, 1)}%`, background: SERIES[i % SERIES.length] }} />
                      </span>
                      <span className="num w-10 shrink-0 text-right font-medium text-ink">{pct(w, 0)}</span>
                    </li>
                  ))}
              </ul>
            </div>
          </Card>

          <Card>
            <CardHead title="Danger zone" />
            <div className="card-pad">
              <p className="text-xs text-ink-2">Deleting a portfolio removes its holdings and saved runs. This cannot be undone.</p>
              <Button
                variant="danger"
                size="sm"
                className="mt-3"
                onClick={() => {
                  if (window.confirm(`Delete "${data.name}" and everything in it?`))
                    void run(async () => {
                      await api(`/portfolios/${activeId}`, { method: "DELETE" });
                      await refresh();
                      window.location.href = "/dashboard";
                    });
                }}
              >
                <Trash2 className="h-4 w-4" /> Delete portfolio
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

function EditRow({ holding, onSave, onCancel }: { holding: Holding; onSave: (b: { quantity: number; average_cost: number }) => void; onCancel: () => void }) {
  const [q, setQ] = useState<number | "">(holding.quantity);
  const [c, setC] = useState<number | "">(holding.average_cost);
  const valid = typeof q === "number" && q > 0 && typeof c === "number" && c > 0;
  return (
    <tr className="bg-brand-50/40">
      <td className="font-medium">{holding.ticker}</td>
      <td className="text-right">
        <NumberInput value={q} onChange={setQ} min={0} step={0.0001} className="w-28" />
      </td>
      <td className="text-right">
        <NumberInput value={c} onChange={setC} min={0} step={0.01} className="w-28" />
      </td>
      <td className="num text-right">{money(holding.current_price, { cents: true })}</td>
      <td className="num text-right">{money(typeof q === "number" && holding.current_price ? q * holding.current_price : null)}</td>
      <td />
      <td className="num text-right text-xs text-ink-2">
        {typeof q === "number" && typeof c === "number" ? `invested ${money(q * c)}` : null}
      </td>
      <td>
        <div className="flex justify-end gap-1">
          <button
            onClick={() => valid && onSave({ quantity: q as number, average_cost: c as number })}
            disabled={!valid}
            aria-label="Save holding"
            className="rounded-full p-1.5 text-pos hover:bg-pos-soft disabled:opacity-40"
          >
            <Check className="h-4 w-4" />
          </button>
          <button onClick={onCancel} aria-label="Cancel edit" className="rounded-full p-1.5 text-ink-3 hover:bg-black/[0.045]">
            <X className="h-4 w-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}

function NewPortfolioForm({ onDone }: { onDone: (id: string) => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr(null);
        try {
          const p = await api<PortfolioDetail>("/portfolios", { body: { name: name.trim() || "New portfolio", holdings: [] } });
          onDone(p.id);
        } catch (e2) {
          setErr(errorMessage(e2));
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="min-w-[220px] flex-1">
        <Field label="Name" htmlFor="np-name" error={err ?? undefined}>
          <input id="np-name" value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="Retirement account" maxLength={120} />
        </Field>
      </div>
      <Button type="submit" size="sm" loading={busy}>
        Create
      </Button>
    </form>
  );
}
