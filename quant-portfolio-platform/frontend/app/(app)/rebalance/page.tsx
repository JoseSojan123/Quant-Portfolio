"use client";

import { ArrowRight } from "lucide-react";
import { useState } from "react";
import useSWR from "swr";

import { DeltaBars, GroupedBars } from "@/components/charts/bars";
import { PageHeader } from "@/components/layout/page-header";
import { NoPortfolio } from "@/components/portfolio/pickers";
import { Disclosure, EstimationControls, OBJECTIVES, type EstimationState } from "@/components/portfolio/settings-panel";
import { Alert, Badge, Button, Card, CardHead, Field, Select, Skeleton, Slider, Stat, StatRow, Toggle } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { dateTime, money, pct, qty, tone } from "@/lib/format";
import { usePortfolios } from "@/lib/portfolio-context";
import type { Preferences, RebalancePlan, RunSummary, Trade } from "@/lib/types";

type TargetMode = "objective" | "run" | "equal";

export default function RebalancePage() {
  const { activeId, loading } = usePortfolios();
  const { data: prefs } = useSWR<Preferences>("/me/preferences");
  const { data: runs } = useSWR<RunSummary[]>("/runs");

  const [mode, setMode] = useState<TargetMode>("objective");
  const [objective, setObjective] = useState("max_sharpe");
  const [runId, setRunId] = useState("");
  const [threshold, setThreshold] = useState<number | null>(null);
  const [costRate, setCostRate] = useState<number | null>(null);
  const [wholeShares, setWholeShares] = useState(true);
  const [est, setEst] = useState<EstimationState | null>(null);
  const [data, setData] = useState<RebalancePlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const estimation: EstimationState = est ?? {
    lookback_days: prefs?.lookback_days ?? 756,
    return_method: prefs?.return_method ?? "historical",
    cov_method: prefs?.cov_method ?? "sample",
    risk_free_rate: prefs?.risk_free_rate ?? 0.04,
  };
  const thr = threshold ?? prefs?.rebalance_threshold ?? 0.05;
  const cost = costRate ?? prefs?.cost_rate ?? 0.001;
  const portfolioRuns = (runs ?? []).filter((r) => !r.portfolio_id || r.portfolio_id === activeId);

  const body = {
    portfolio_id: activeId,
    threshold: thr,
    cost_rate: cost,
    whole_shares: wholeShares,
    force: true,
    ...(mode === "run" && runId ? { target_run_id: runId } : {}),
    ...(mode === "objective" ? { target_objective: objective } : {}),
    ...(mode === "equal" ? { target_objective: "equal_weight" } : {}),
    ...estimation,
  };

  const ready = activeId && (mode !== "run" || !!runId);
  const key = ready ? `reb|${JSON.stringify(body)}` : null;
  const { data: auto, error: autoError, isLoading } = useSWR<RebalancePlan>(
    key,
    () => api<RebalancePlan>("/portfolio/rebalance", { body }),
    { keepPreviousData: true },
  );
  const plan = data ?? auto;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      setData(await api<RebalancePlan>("/portfolio/rebalance", { body: { ...body, save: true } }));
      setSaved(true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Skeleton className="h-72" />;
  if (!activeId) return <NoPortfolio />;

  const trades = plan?.trades ?? [];
  const toTrade = trades.filter((t) => t.action !== "hold");

  return (
    <>
      <PageHeader
        title="Rebalancing"
        subtitle="Compare your current weights with a target, see which positions have drifted, and get the exact trade list."
        help={
          <>
            Prices move, so weights drift away from the target even when you do nothing. The threshold rule below only recommends
            a rebalance when the largest drift exceeds your tolerance, because every trade costs money. Turnover is measured as
            the sum of absolute weight changes, so a full switch from one asset to another is 200% turnover.
          </>
        }
      >
        <Button variant="secondary" size="sm" onClick={save} loading={busy} disabled={!plan}>
          Save this plan
        </Button>
      </PageHeader>

      {error || autoError ? <Alert kind="error">{errorMessage(error ?? autoError)}</Alert> : null}
      {saved ? (
        <div className="mb-4">
          <Alert kind="success" onClose={() => setSaved(false)}>
            Plan saved. You still have to place the trades yourself — this app never touches a brokerage account.
          </Alert>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card>
            <CardHead title="Target weights" subtitle="What you want to rebalance towards." />
            <div className="card-pad space-y-4">
              <Field label="Source of the target" htmlFor="mode">
                <Select
                  id="mode"
                  value={mode}
                  onChange={(v) => setMode(v as TargetMode)}
                  options={[
                    { value: "objective", label: "Optimize now for an objective" },
                    { value: "run", label: "A saved optimization" },
                    { value: "equal", label: "Equal weight" },
                  ]}
                />
              </Field>
              {mode === "objective" ? (
                <Field label="Objective" htmlFor="obj">
                  <Select id="obj" value={objective} onChange={setObjective} options={OBJECTIVES} />
                </Field>
              ) : null}
              {mode === "run" ? (
                portfolioRuns.length ? (
                  <Field label="Saved optimization" htmlFor="run">
                    <Select
                      id="run"
                      value={runId}
                      onChange={setRunId}
                      options={[
                        { value: "", label: "Choose a saved run…" },
                        ...portfolioRuns.map((r) => ({
                          value: r.run_id,
                          label: `${r.name || r.objective_label} · ${dateTime(r.created_at)}`,
                        })),
                      ]}
                    />
                  </Field>
                ) : (
                  <p className="text-sm text-ink-3">
                    You have no saved optimizations yet. Run one on the Optimize page and tick “save” to use it here.
                  </p>
                )
              ) : null}
            </div>
          </Card>

          <Card>
            <CardHead title="Trading rules" />
            <div className="card-pad space-y-4">
              <Slider
                label="Rebalance threshold"
                display={pct(thr, 0)}
                min={0}
                max={0.25}
                step={0.01}
                value={thr}
                onChange={setThreshold}
              />
              <Slider
                label="Transaction cost"
                display={`${(cost * 100).toFixed(2)}%`}
                min={0}
                max={0.01}
                step={0.0005}
                value={cost}
                onChange={setCostRate}
              />
              <Toggle
                checked={wholeShares}
                onChange={setWholeShares}
                label="Round to whole shares"
                hint="Turn this off if your broker supports fractional shares."
              />
            </div>
            <Disclosure title="Estimation settings">
              <EstimationControls value={estimation} onChange={setEst} />
            </Disclosure>
          </Card>
        </div>

        <div className="space-y-5">
          {isLoading && !plan ? <Skeleton className="h-96" /> : null}
          {!ready ? <Alert kind="info">Choose a saved optimization to compare against.</Alert> : null}
          {plan ? (
            <>
              <Alert kind={plan.rebalance_recommended ? "warning" : "success"} title={plan.rebalance_recommended ? "A rebalance is warranted" : "No rebalance needed yet"}>
                The largest drift is <strong>{pct(plan.max_drift, 1)}</strong> against a threshold of {pct(plan.threshold, 1)}.{" "}
                {plan.rebalance_recommended
                  ? `Bringing the portfolio back to ${plan.target_label} means ${pct(plan.turnover, 1)} turnover and about ${money(plan.estimated_cost)} in costs.`
                  : "Every trade costs money, so holding is the cheaper choice until a position drifts further."}
              </Alert>

              <Card className="card-pad">
                <StatRow cols={4}>
                  <Stat label="Portfolio value" value={money(plan.portfolio_value)} />
                  <Stat label="Largest drift" value={pct(plan.max_drift, 1)} hint={`threshold ${pct(plan.threshold, 1)}`} />
                  <Stat
                    label="Turnover"
                    value={pct(plan.turnover, 1)}
                    hint={plan.convention}
                    help={
                      <>
                        Turnover is <span className="num">&Sigma;|target − current|</span>, so selling 10% of one asset to buy
                        another counts as 20%. One-way turnover ({pct(plan.one_way_turnover, 1)}) is half of it, which is the
                        figure brokers usually quote.
                      </>
                    }
                  />
                  <Stat label="Estimated cost" value={money(plan.estimated_cost)} hint={`${(plan.cost_rate * 100).toFixed(2)}% per trade`} />
                </StatRow>
              </Card>

              <Card>
                <CardHead title="Current vs target weights" subtitle={`Target: ${plan.target_label}`} />
                <div className="card-pad">
                  <GroupedBars
                    data={trades.map((t) => ({ ticker: t.ticker, current: t.current_weight, target: t.target_weight }))}
                    categoryKey="ticker"
                    series={[
                      { key: "current", label: "Current" },
                      { key: "target", label: "Target" },
                    ]}
                    format="pct"
                  />
                </div>
              </Card>

              <Card>
                <CardHead title="Drift per position" subtitle="Positive means you are overweight relative to the target." />
                <div className="card-pad">
                  <DeltaBars
                    data={trades.map((t) => ({ ticker: t.ticker, drift: t.drift }))}
                    categoryKey="ticker"
                    valueKey="drift"
                    format="pct"
                    tone="change"
                    valueLabel="Drift"
                  />
                </div>
              </Card>

              <Card>
                <CardHead
                  help={
                    <>
                    <p>
                      Target value per asset is the target weight times the portfolio value. The trade value is that minus the
                      current value; shares are the trade value divided by the latest price
                      {plan.trades.some((t) => t.shares !== null && Number.isInteger(t.shares)) ? ", rounded to whole shares" : ""}.
                    </p>
                    <p>
                      Cost is estimated as {(plan.cost_rate * 100).toFixed(2)}% of the traded notional, which is a stand-in for
                      commission and spread. Taxes on realized gains are not modelled.
                    </p>
                    </>
                  }
                  title="Trade list"
                  subtitle={toTrade.length ? `${toTrade.length} orders to place yourself` : "Nothing to trade at this threshold"}
                  right={<Badge kind={plan.rebalance_recommended ? "warn" : "pos"}>{plan.rebalance_recommended ? "Action suggested" : "In tolerance"}</Badge>}
                />
                <div className="overflow-x-auto">
                  <table className="table-base">
                    <thead>
                      <tr>
                        <th scope="col">Asset</th>
                        <th scope="col">Action</th>
                        <th scope="col" className="text-right">Current</th>
                        <th scope="col" className="text-right">Target</th>
                        <th scope="col" className="text-right">Drift</th>
                        <th scope="col" className="text-right">Value</th>
                        <th scope="col" className="text-right">Shares</th>
                        <th scope="col" className="text-right">Price</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trades.map((t) => (
                        <TradeRow key={t.ticker} trade={t} />
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              <Alert kind="info" title="This is a plan, not an order">
                The app has no brokerage connection and never asks for one. Place these trades yourself, then update your
                holdings on the Portfolio page so the analytics follow your real position.
              </Alert>
            </>
          ) : null}
        </div>
      </div>
    </>
  );
}

function TradeRow({ trade: t }: { trade: Trade }) {
  const label = t.action === "buy" ? "Buy" : t.action === "sell" ? "Sell" : "Hold";
  return (
    <tr>
      <td>
        <span className="font-medium">{t.ticker}</span>
        {t.name ? <span className="block max-w-[14rem] truncate text-xs text-ink-3">{t.name}</span> : null}
      </td>
      <td>
        <span className={`inline-flex items-center gap-1 text-sm font-medium ${t.action === "buy" ? "text-pos" : t.action === "sell" ? "text-neg" : "text-ink-3"}`}>
          {t.action !== "hold" ? <ArrowRight className={`h-3.5 w-3.5 ${t.action === "sell" ? "rotate-180" : ""}`} /> : null}
          {label}
          {t.breach ? <span className="ml-1 text-xs font-normal text-warn">(past threshold)</span> : null}
        </span>
      </td>
      <td className="num text-right">{pct(t.current_weight, 1)}</td>
      <td className="num text-right">{pct(t.target_weight, 1)}</td>
      <td className={`num text-right ${tone(t.drift)}`}>{pct(t.drift, 1, true)}</td>
      <td className={`num text-right font-medium ${tone(t.trade_value)}`}>{t.action === "hold" ? "—" : money(t.trade_value, { signed: true })}</td>
      <td className="num text-right">{t.shares === null || t.action === "hold" ? "—" : qty(t.shares)}</td>
      <td className="num text-right text-ink-2">{t.price === null ? "—" : money(t.price, { cents: true })}</td>
    </tr>
  );
}
