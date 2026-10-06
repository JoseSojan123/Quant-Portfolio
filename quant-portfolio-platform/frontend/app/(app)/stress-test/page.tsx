"use client";

import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import useSWR from "swr";

import { DeltaBars } from "@/components/charts/bars";
import { InputsNote, PageHeader } from "@/components/layout/page-header";
import { NoPortfolio } from "@/components/portfolio/pickers";
import { Alert, Badge, Button, Card, CardHead, Field, NumberInput, Select, Skeleton, Stat, StatRow, Toggle } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { money, num, pct, tone } from "@/lib/format";
import { usePortfolios } from "@/lib/portfolio-context";
import type { PortfolioDetail, Scenario, StressPayload, StressResult } from "@/lib/types";

type CustomShock = { ticker: string; shock: number };

export default function StressTestPage() {
  const { activeId, loading } = usePortfolios();
  const { data: scenarios } = useSWR<Scenario[]>("/risk/scenarios");
  const { data: detail } = useSWR<PortfolioDetail>(activeId ? `/portfolios/${activeId}` : null);

  const [selected, setSelected] = useState<string[] | null>(null);
  const [shocks, setShocks] = useState<CustomShock[]>([]);
  const [newTicker, setNewTicker] = useState("");
  const [newShock, setNewShock] = useState<number | "">(-20);
  const [customName, setCustomName] = useState("My scenario");
  const [data, setData] = useState<StressPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const held = detail?.valuation.holdings.map((h) => h.ticker) ?? [];
  const ids = selected ?? scenarios?.map((s) => s.id) ?? [];

  const key = activeId && scenarios ? `stress|${activeId}|${ids.join(",")}|${JSON.stringify(shocks)}` : null;
  const { data: auto, error: autoError, isLoading } = useSWR<StressPayload>(
    key,
    () =>
      api<StressPayload>("/risk/stress", {
        body: {
          portfolio_id: activeId,
          scenario_ids: ids,
          custom: shocks.length ? { name: customName, shocks: Object.fromEntries(shocks.map((s) => [s.ticker, s.shock / 100])) } : undefined,
        },
      }),
    { keepPreviousData: true },
  );
  const payload = data ?? auto;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      setData(
        await api<StressPayload>("/risk/stress", {
          body: {
            portfolio_id: activeId,
            scenario_ids: ids,
            custom: shocks.length ? { name: customName, shocks: Object.fromEntries(shocks.map((s) => [s.ticker, s.shock / 100])) } : undefined,
            save: true,
          },
        }),
      );
      setSaved(true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Skeleton className="h-72" />;
  if (!activeId) return <NoPortfolio />;

  return (
    <>
      <PageHeader
        title="Stress testing"
        subtitle="Apply a deliberate, severe shock and see what it does to your portfolio and which holdings drive the loss."
        help={
          <>
            A stress test is not a probability statement. It takes one adverse assumption — a market fall, a sector sell-off, a
            rate shock, or the actual moves from a historical episode — applies it to your current weights, and reports the P&amp;L.
            Monte Carlo explores a distribution; stress testing examines chosen scenarios. Both belong on a risk dashboard.
          </>
        }
      >
        <Button variant="secondary" size="sm" onClick={save} loading={busy}>
          Save results
        </Button>
      </PageHeader>

      {error || autoError ? <Alert kind="error">{errorMessage(error ?? autoError)}</Alert> : null}
      {saved ? (
        <div className="mb-4">
          <Alert kind="success" onClose={() => setSaved(false)}>
            Scenario results saved to your history.
          </Alert>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card>
            <CardHead title="Scenarios" subtitle="Pick which shocks to apply." />
            <div className="card-pad space-y-1">
              {(scenarios ?? []).map((s) => (
                <Toggle
                  key={s.id}
                  checked={ids.includes(s.id)}
                  onChange={(on) => {
                    const base = selected ?? scenarios?.map((x) => x.id) ?? [];
                    setSelected(on ? [...new Set([...base, s.id])] : base.filter((x) => x !== s.id));
                  }}
                  label={s.name}
                  hint={s.assumptions[0]}
                />
              ))}
            </div>
          </Card>

          <Card>
            <CardHead title="Custom scenario" subtitle="Shock individual holdings yourself." />
            <div className="card-pad space-y-3">
              <Field label="Scenario name" htmlFor="cs-name">
                <input id="cs-name" value={customName} onChange={(e) => setCustomName(e.target.value)} className="input" maxLength={120} />
              </Field>
              <div className="grid grid-cols-[1.3fr_1fr_auto] items-end gap-2">
                <Field label="Asset" htmlFor="cs-ticker">
                  <Select
                    id="cs-ticker"
                    value={newTicker || held[0] || ""}
                    onChange={setNewTicker}
                    options={held.filter((t) => !shocks.some((s) => s.ticker === t)).map((t) => ({ value: t, label: t }))}
                  />
                </Field>
                <Field label="Shock" htmlFor="cs-shock">
                  <NumberInput id="cs-shock" value={newShock} onChange={setNewShock} min={-100} max={500} step={5} suffix="%" />
                </Field>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    const t = newTicker || held.find((x) => !shocks.some((s) => s.ticker === x)) || "";
                    if (!t || typeof newShock !== "number") return;
                    setShocks((prev) => [...prev.filter((s) => s.ticker !== t), { ticker: t, shock: newShock }]);
                    setNewTicker("");
                  }}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {shocks.length ? (
                <ul className="space-y-1.5">
                  {shocks.map((s) => (
                    <li key={s.ticker} className="flex items-center gap-2 rounded-xl bg-black/[0.035] px-3 py-2 text-sm">
                      <span className="font-medium text-ink">{s.ticker}</span>
                      <span className={`num ${tone(s.shock)}`}>{s.shock > 0 ? "+" : ""}{s.shock}%</span>
                      <button
                        onClick={() => setShocks((prev) => prev.filter((x) => x.ticker !== s.ticker))}
                        aria-label={`Remove ${s.ticker} shock`}
                        className="ml-auto rounded p-1 text-ink-3 hover:text-neg"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-ink-3">Add a shock and it appears alongside the predefined scenarios.</p>
              )}
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          {isLoading && !payload ? <Skeleton className="h-96" /> : null}
          {payload ? (
            <>
              {payload.worst ? (
                <Card className="card-pad">
                  <StatRow cols={3}>
                    <Stat label="Portfolio value today" value={money(payload.capital)} size="lg" />
                    <Stat label="Worst scenario" value={pct(payload.worst.pct_change, 1)} hint={payload.worst.scenario} />
                    <Stat label="Loss in that scenario" value={money(payload.worst.pnl, { signed: true })} hint="hypothetical" />
                  </StatRow>
                </Card>
              ) : null}

              <Card>
                <CardHead title="Scenario summary" subtitle="Sorted from worst to best outcome." />
                <div className="overflow-x-auto">
                  <table className="table-base">
                    <thead>
                      <tr>
                        <th scope="col">Scenario</th>
                        <th scope="col" className="text-right">Value before</th>
                        <th scope="col" className="text-right">Value after</th>
                        <th scope="col" className="text-right">P&amp;L</th>
                        <th scope="col" className="text-right">Change</th>
                        <th scope="col" className="hidden lg:table-cell">Biggest loss contributors</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...payload.results]
                        .sort((a, b) => a.pct_change - b.pct_change)
                        .map((r) => (
                          <tr key={r.scenario.id + r.scenario.name}>
                            <td className="min-w-[14rem] whitespace-normal">
                              <span className="font-medium">{r.scenario.name}</span>
                              <span className="block max-w-sm whitespace-normal text-xs text-ink-3">{r.scenario.assumptions.join(" · ")}</span>
                            </td>
                            <td className="num text-right">{money(r.value_before)}</td>
                            <td className="num text-right">{money(r.value_after)}</td>
                            <td className={`num text-right font-medium ${tone(r.pnl)}`}>{money(r.pnl, { signed: true })}</td>
                            <td className={`num text-right font-medium ${tone(r.pct_change)}`}>{pct(r.pct_change, 1, true)}</td>
                            <td className="hidden min-w-[9rem] whitespace-normal text-xs text-ink-2 lg:table-cell">
                              {r.largest_contributors.map((c) => `${c.ticker} ${money(c.pnl, { signed: true, compact: true })}`).join(" · ") || "—"}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                <div className="card-pad border-t border-hair">
                  <InputsNote inputs={payload.inputs} />
                  <p className="mt-2 flex items-start gap-1.5 text-xs text-warn">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    Every scenario here is hypothetical. It shows sensitivity to an assumed shock, not a forecast.
                  </p>
                </div>
              </Card>

              {[...payload.results]
                .sort((a, b) => a.pct_change - b.pct_change)
                .map((r) => (
                  <ScenarioDetail key={r.scenario.id + r.scenario.name} result={r} />
                ))}
            </>
          ) : null}
        </div>
      </div>
    </>
  );
}

function ScenarioDetail({ result }: { result: StressResult }) {
  const rows = result.contributions.filter((c) => Math.abs(c.weight) > 1e-6);
  return (
    <Card>
      <CardHead
        title={result.scenario.name}
        subtitle={result.scenario.description}
        right={
          <Badge kind={result.pct_change < 0 ? "neg" : "pos"}>
            {pct(result.pct_change, 1, true)} · {money(result.pnl, { signed: true, compact: true })}
          </Badge>
        }
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.1fr]">
        <div className="card-pad">
          <p className="label mb-2">Shock applied to each holding</p>
          <DeltaBars data={rows.map((c) => ({ ticker: c.ticker, shock: c.shock }))} categoryKey="ticker" valueKey="shock" format="pct" />
          {result.notes.length ? <p className="mt-2 text-xs text-warn">{result.notes.join(" · ")}</p> : null}
        </div>
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th scope="col">Asset</th>
                <th scope="col" className="text-right">Weight</th>
                <th scope="col" className="text-right">Shock</th>
                <th scope="col" className="text-right">P&amp;L</th>
                <th scope="col" className="text-right">Share of loss</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.ticker}>
                  <td>
                    <span className="font-medium">{c.ticker}</span>
                    {c.beta !== null && c.beta !== undefined && result.scenario.kind === "beta" ? (
                      <span className="block text-xs text-ink-3">beta {num(c.beta)}</span>
                    ) : null}
                  </td>
                  <td className="num text-right">{pct(c.weight, 1)}</td>
                  <td className={`num text-right ${tone(c.shock)}`}>{pct(c.shock, 1, true)}</td>
                  <td className={`num text-right font-medium ${tone(c.pnl)}`}>{money(c.pnl, { signed: true })}</td>
                  <td className="num text-right text-ink-2">{c.share_of_loss > 0 ? pct(c.share_of_loss, 0) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Card>
  );
}
