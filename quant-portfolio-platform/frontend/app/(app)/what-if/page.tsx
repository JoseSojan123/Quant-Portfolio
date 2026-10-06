"use client";

import { useState } from "react";
import useSWR from "swr";

import { GroupedBars } from "@/components/charts/bars";
import { InputsNote, PageHeader } from "@/components/layout/page-header";
import { NoPortfolio } from "@/components/portfolio/pickers";
import { Disclosure, EstimationControls, OBJECTIVES, type EstimationState } from "@/components/portfolio/settings-panel";
import { Alert, Card, CardHead, Field, NumberInput, Select, Skeleton, Slider, Stat, StatRow } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { dateTime, money, num, pct, tone } from "@/lib/format";
import { usePortfolios } from "@/lib/portfolio-context";
import type { OptimizeResult, PortfolioDetail, Preferences, RunSummary, WhatIfResult } from "@/lib/types";

type ActionType = "add_cash" | "asset_shock" | "market_shock" | "reduce_holding" | "rebalance_to";

const ACTIONS: { value: ActionType; label: string; blurb: string }[] = [
  { value: "add_cash", label: "Invest more money", blurb: "Add cash and spread it across your current positions in proportion." },
  { value: "asset_shock", label: "Shock one holding", blurb: "Move a single asset's price and see the effect on the whole portfolio." },
  { value: "market_shock", label: "Shock the whole market", blurb: "Move the market and translate it through each holding's beta." },
  { value: "reduce_holding", label: "Trim a position", blurb: "Cut one position by a number of percentage points and redistribute." },
  { value: "rebalance_to", label: "Switch to a target allocation", blurb: "Apply an optimized allocation and pay the transaction cost." },
];

const RISK_ROWS: { key: string; label: string; format: "pct" | "num" | "money" }[] = [
  { key: "expected_return", label: "Expected annual return", format: "pct" },
  { key: "volatility", label: "Annual volatility", format: "pct" },
  { key: "sharpe", label: "Sharpe ratio", format: "num" },
  { key: "var_95", label: "Daily VaR (95%)", format: "pct" },
  { key: "es_95", label: "Daily Expected Shortfall (95%)", format: "pct" },
  { key: "max_drawdown", label: "Worst historical drawdown", format: "pct" },
  { key: "beta", label: "Market beta", format: "num" },
];

export default function WhatIfPage() {
  const { activeId, loading } = usePortfolios();
  const { data: prefs } = useSWR<Preferences>("/me/preferences");
  const { data: detail } = useSWR<PortfolioDetail>(activeId ? `/portfolios/${activeId}` : null);
  const { data: runs } = useSWR<RunSummary[]>("/runs");

  const [type, setType] = useState<ActionType>("asset_shock");
  const [ticker, setTicker] = useState("");
  const [shock, setShock] = useState(-20);
  const [amount, setAmount] = useState<number | "">(10000);
  const [points, setPoints] = useState(0.1);
  const [target, setTarget] = useState("max_sharpe");
  const [est, setEst] = useState<EstimationState | null>(null);

  const estimation: EstimationState = est ?? {
    lookback_days: prefs?.lookback_days ?? 756,
    return_method: prefs?.return_method ?? "historical",
    cov_method: prefs?.cov_method ?? "sample",
    risk_free_rate: prefs?.risk_free_rate ?? 0.04,
  };

  const held = detail?.valuation.holdings.map((h) => h.ticker) ?? [];
  const chosen = ticker || held[0] || "";
  const runOptions = (runs ?? []).filter((r) => !r.portfolio_id || r.portfolio_id === activeId);

  const action =
    type === "add_cash"
      ? { type, amount: typeof amount === "number" ? amount : 0 }
      : type === "asset_shock"
        ? { type, ticker: chosen, shock: shock / 100 }
        : type === "market_shock"
          ? { type, shock: shock / 100 }
          : type === "reduce_holding"
            ? { type, ticker: chosen, percentage_points: points }
            : target.startsWith("run:")
              ? { type, run_id: target.slice(4) }
              : { type, weights: undefined as Record<string, number> | undefined };

  // "rebalance_to" with an objective needs weights, so optimize first and feed them in.
  const optKey = activeId && type === "rebalance_to" && !target.startsWith("run:") ? `wi-opt|${activeId}|${target}|${JSON.stringify(estimation)}` : null;
  const { data: opt } = useSWR<OptimizeResult>(optKey, () =>
    api<OptimizeResult>("/portfolio/optimize", { body: { portfolio_id: activeId, objective: target, ...estimation } }),
  );

  const resolved =
    type === "rebalance_to" && !target.startsWith("run:")
      ? opt
        ? { type, weights: opt.optimized.weights }
        : null
      : action;

  const ready = Boolean(
    activeId &&
      resolved &&
      (type !== "add_cash" || (typeof amount === "number" && amount > 0)) &&
      (type !== "asset_shock" || chosen) &&
      (type !== "reduce_holding" || chosen),
  );

  const key = ready ? `whatif|${activeId}|${JSON.stringify(resolved)}|${JSON.stringify(estimation)}` : null;
  const { data: result, error: autoError, isLoading } = useSWR<WhatIfResult>(
    key,
    () => api<WhatIfResult>("/what-if", { body: { portfolio_id: activeId, action: resolved, ...estimation } }),
    { keepPreviousData: true },
  );

  if (loading) return <Skeleton className="h-72" />;
  if (!activeId) return <NoPortfolio />;
  if (detail && detail.valuation.holdings.length === 0) {
    return (
      <>
        <PageHeader title="What-if analysis" />
        <Alert kind="info">Add a holding on the Portfolio page first — a what-if needs a starting position.</Alert>
      </>
    );
  }

  const blurb = ACTIONS.find((a) => a.value === type)?.blurb;

  return (
    <>
      <PageHeader
        title="What-if analysis"
        subtitle="Change one thing about your portfolio and see the effect on value, weights and risk before you act."
        help={
          <>
            Every what-if is applied to your current holdings at current prices, with the same estimation window used elsewhere
            in the app. Nothing here is saved to your portfolio: it is a sandbox, so your real holdings stay untouched until you
            edit them yourself.
          </>
        }
      />

      {autoError ? <Alert kind="error">{errorMessage(autoError)}</Alert> : null}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card>
            <CardHead title="The change" subtitle={blurb} />
            <div className="card-pad space-y-4">
              <Field label="What do you want to try?" htmlFor="type">
                <Select id="type" value={type} onChange={(v) => setType(v as ActionType)} options={ACTIONS.map((a) => ({ value: a.value, label: a.label }))} />
              </Field>

              {type === "add_cash" ? (
                <Field label="Amount to invest" htmlFor="amount" hint="Spread across your current positions in proportion to their weights.">
                  <NumberInput id="amount" value={amount} onChange={setAmount} min={1} step={1000} />
                </Field>
              ) : null}

              {type === "asset_shock" || type === "reduce_holding" ? (
                <Field label="Which holding?" htmlFor="ticker">
                  <Select id="ticker" value={chosen} onChange={setTicker} options={held.map((t) => ({ value: t, label: t }))} />
                </Field>
              ) : null}

              {type === "asset_shock" || type === "market_shock" ? (
                <Slider
                  label={type === "market_shock" ? "Market move" : `${chosen || "Asset"} price move`}
                  display={`${shock > 0 ? "+" : ""}${shock}%`}
                  min={-80}
                  max={80}
                  step={5}
                  value={shock}
                  onChange={setShock}
                />
              ) : null}

              {type === "reduce_holding" ? (
                <Slider
                  label="Cut this position by"
                  display={`${pct(points, 0)} of the portfolio`}
                  min={0.01}
                  max={0.5}
                  step={0.01}
                  value={points}
                  onChange={setPoints}
                />
              ) : null}

              {type === "rebalance_to" ? (
                <Field label="Target allocation" htmlFor="target">
                  <Select
                    id="target"
                    value={target}
                    onChange={setTarget}
                    options={[
                      ...OBJECTIVES.map((o) => ({ value: o.value, label: `Optimize for ${o.label.toLowerCase()}` })),
                      ...runOptions.map((r) => ({ value: `run:${r.run_id}`, label: `Saved: ${r.name || r.objective_label} · ${dateTime(r.created_at)}` })),
                    ]}
                  />
                </Field>
              ) : null}
            </div>
            <Disclosure title="Estimation settings">
              <EstimationControls value={estimation} onChange={setEst} />
            </Disclosure>
          </Card>
        </div>

        <div className="space-y-5">
          {isLoading && !result ? <Skeleton className="h-80" /> : null}
          {result ? (
            <>
              <Card className="card-pad">
                <p className="text-sm text-ink-2">{result.description}</p>
                <div className="mt-4">
                  <StatRow cols={4}>
                    <Stat label="Value before" value={money(result.value_before)} />
                    <Stat label="Value after" value={money(result.value_after)} size="lg" />
                    <Stat label="Profit and loss" value={money(result.pnl, { signed: true })} hint={pct(result.pct_change, 2, true)} />
                    <Stat
                      label="Transaction cost"
                      value={result.transaction_cost > 0 ? money(result.transaction_cost) : "none"}
                      hint={result.cash_added > 0 ? `${money(result.cash_added)} cash added` : "no trades needed"}
                    />
                  </StatRow>
                </div>
              </Card>

              <Card>
                <CardHead title="Risk before and after" subtitle="Same estimation window on both sides, so the comparison is fair." />
                <div className="overflow-x-auto">
                  <table className="table-base">
                    <thead>
                      <tr>
                        <th scope="col">Measure</th>
                        <th scope="col" className="text-right">Before</th>
                        <th scope="col" className="text-right">After</th>
                        <th scope="col" className="text-right">Change</th>
                      </tr>
                    </thead>
                    <tbody>
                      {RISK_ROWS.filter((r) => result.risk_before[r.key] !== undefined).map((r) => {
                        const a = result.risk_before[r.key];
                        const b = result.risk_after[r.key];
                        const fmt = (v: number | null) => (v === null || v === undefined ? "—" : r.format === "pct" ? pct(v, 2) : num(v));
                        const delta = a !== null && a !== undefined && b !== null && b !== undefined ? b - a : null;
                        return (
                          <tr key={r.key}>
                            <td>{r.label}</td>
                            <td className="num text-right">{fmt(a)}</td>
                            <td className="num text-right font-medium">{fmt(b)}</td>
                            <td className="num text-right text-ink-2">{delta === null ? "—" : r.format === "pct" ? pct(delta, 2, true) : `${delta > 0 ? "+" : ""}${num(delta)}`}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="card-pad border-t border-hair">
                  <InputsNote inputs={result.inputs} />
                </div>
              </Card>

              <Card>
                <CardHead title="Weights before and after" />
                <div className="card-pad">
                  <GroupedBars
                    data={result.holdings.map((h) => ({ ticker: h.ticker, before: h.weight_before, after: h.weight_after }))}
                    categoryKey="ticker"
                    series={[
                      { key: "before", label: "Before" },
                      { key: "after", label: "After" },
                    ]}
                    format="pct"
                  />
                </div>
              </Card>

              <Card>
                <CardHead title="Position by position" />
                <div className="overflow-x-auto">
                  <table className="table-base">
                    <thead>
                      <tr>
                        <th scope="col">Asset</th>
                        <th scope="col" className="text-right">Weight before</th>
                        <th scope="col" className="text-right">Weight after</th>
                        <th scope="col" className="text-right">Value before</th>
                        <th scope="col" className="text-right">Value after</th>
                        <th scope="col" className="text-right">P&amp;L</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.holdings.map((h) => (
                        <tr key={h.ticker}>
                          <td className="font-medium">{h.ticker}</td>
                          <td className="num text-right">{pct(h.weight_before, 1)}</td>
                          <td className="num text-right">{pct(h.weight_after, 1)}</td>
                          <td className="num text-right">{money(h.value_before)}</td>
                          <td className="num text-right">{money(h.value_after)}</td>
                          <td className={`num text-right font-medium ${tone(h.pnl)}`}>{h.pnl === 0 ? "—" : money(h.pnl, { signed: true })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              <Alert kind="info" title="Nothing was saved">
                Your holdings are unchanged. If you decide to act on this, place the trades with your broker and then edit your
                holdings on the Portfolio page.
              </Alert>
            </>
          ) : null}
        </div>
      </div>
    </>
  );
}
