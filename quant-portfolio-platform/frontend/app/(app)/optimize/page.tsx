"use client";

import { ArrowRight, Lightbulb, Save, Sliders } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import useSWR from "swr";

import { SERIES } from "@/components/charts/base";
import { AllocationDonut } from "@/components/charts/allocation";
import { DeltaBars, GroupedBars } from "@/components/charts/bars";
import { InputsNote, PageHeader } from "@/components/layout/page-header";
import { AssetSelector, NoPortfolio } from "@/components/portfolio/pickers";
import {
  ConstraintControls,
  constraintPayload,
  DEFAULT_CONSTRAINTS,
  Disclosure,
  EstimationControls,
  OBJECTIVES,
  type ConstraintState,
  type EstimationState,
} from "@/components/portfolio/settings-panel";
import { Alert, Badge, Button, Card, CardHead, Field, Select, Skeleton, Stat, StatRow, Toggle } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { money, num, pct, tone } from "@/lib/format";
import { usePortfolios } from "@/lib/portfolio-context";
import type { Asset, OptimizeResult, PortfolioDetail, Preferences } from "@/lib/types";

export default function OptimizePage() {
  const { activeId, loading } = usePortfolios();
  const { data: prefs } = useSWR<Preferences>("/me/preferences");
  const { data: assets } = useSWR<Asset[]>("/assets");
  const { data: detail } = useSWR<PortfolioDetail>(activeId ? `/portfolios/${activeId}` : null);

  const [objective, setObjective] = useState("max_sharpe");
  const [extra, setExtra] = useState<string[]>([]);
  const [showUniverse, setShowUniverse] = useState(false);
  const [constraints, setConstraints] = useState<ConstraintState>(DEFAULT_CONSTRAINTS);
  const [est, setEst] = useState<EstimationState | null>(null);
  const [result, setResult] = useState<OptimizeResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const estimation: EstimationState = est ?? {
    lookback_days: prefs?.lookback_days ?? 756,
    return_method: prefs?.return_method ?? "historical",
    cov_method: prefs?.cov_method ?? "sample",
    risk_free_rate: prefs?.risk_free_rate ?? 0.04,
  };

  const held = useMemo(() => detail?.valuation.holdings.map((h) => h.ticker) ?? [], [detail]);
  const universe = useMemo(() => [...held, ...extra], [held, extra]);
  const sectors = useMemo(() => {
    const set = new Set<string>();
    (assets ?? []).filter((a) => universe.includes(a.ticker)).forEach((a) => set.add(a.sector));
    return Array.from(set).sort();
  }, [assets, universe]);

  const currentWeights = useMemo(
    () => Object.fromEntries((detail?.valuation.holdings ?? []).map((h) => [h.ticker, h.weight])),
    [detail],
  );

  if (loading) return <Skeleton className="h-72" />;
  if (!activeId) return <NoPortfolio />;

  async function run(save = false) {
    if (save) setSaving(true);
    else setBusy(true);
    setError(null);
    setSaved(null);
    try {
      const res = await api<OptimizeResult>("/portfolio/optimize", {
        body: {
          portfolio_id: activeId,
          assets: extra.length ? extra : undefined,
          objective,
          ...estimation,
          ...constraintPayload(constraints, objective, currentWeights),
          save,
          name: save ? `${OBJECTIVES.find((o) => o.value === objective)?.label} · ${new Date().toLocaleDateString()}` : undefined,
        },
      });
      setResult(res);
      if (save && res.run_id) setSaved(res.run_id);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Optimize my portfolio"
        subtitle="Compare what you hold today with a mathematically optimized allocation under constraints you choose."
        help={
          <>
            The optimizer maximizes or minimizes your chosen objective subject to the constraints, using estimated expected
            returns (&mu;) and the covariance matrix (&Sigma;) from the selected window. It is not an oracle: it returns the
            best allocation <em>for these inputs</em>, and historical expected returns are noisy.
          </>
        }
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        {/* Controls */}
        <div className="space-y-4">
          <Card>
            <CardHead title="Objective" />
            <div className="card-pad space-y-4">
              <Field label="What should the optimizer do?" htmlFor="obj">
                <Select id="obj" value={objective} onChange={setObjective} options={OBJECTIVES} />
              </Field>
              <p className="text-xs leading-relaxed text-ink-2">{OBJECTIVE_HELP[objective]}</p>
            </div>

            <Disclosure title="Constraints" defaultOpen>
              <ConstraintControls value={constraints} onChange={setConstraints} sectors={sectors} objective={objective} nAssets={universe.length} />
            </Disclosure>

            <Disclosure title="Estimation settings">
              <EstimationControls value={estimation} onChange={setEst} />
            </Disclosure>

            <Disclosure title={`Candidate assets (${universe.length})`}>
              <Toggle
                checked={showUniverse}
                onChange={setShowUniverse}
                label="Let the optimizer consider assets I do not own yet"
                hint="Your holdings are always included."
              />
              {showUniverse && assets ? (
                <div className="mt-3">
                  <AssetSelector assets={assets.filter((a) => !held.includes(a.ticker))} selected={extra} onChange={setExtra} max={25} />
                </div>
              ) : null}
            </Disclosure>

            <div className="card-pad border-t border-hair">
              <Button onClick={() => run(false)} loading={busy} className="w-full">
                <Sliders className="h-4 w-4" /> Run optimization
              </Button>
            </div>
          </Card>
        </div>

        {/* Results */}
        <div className="space-y-5">
          {error ? <Alert kind="error">{error}</Alert> : null}
          {!result && !busy ? (
            <Card>
              <div className="px-5 py-14 text-center">
                <p className="text-sm font-semibold text-ink">Pick an objective and run the optimizer</p>
                <p className="mx-auto mt-1 max-w-md text-sm text-ink-2">
                  You will get the recommended weights, a side-by-side comparison with your current allocation, and a plain-language
                  explanation of what changed.
                </p>
              </div>
            </Card>
          ) : null}
          {busy && !result ? <Skeleton className="h-96" /> : null}
          {result ? <OptimizeResultView result={result} onSave={() => run(true)} saving={saving} savedRunId={saved} /> : null}
        </div>
      </div>
    </>
  );
}

const OBJECTIVE_HELP: Record<string, string> = {
  max_sharpe: "Maximize (expected return − risk-free rate) / volatility. Can become concentrated when expected returns are noisy, which is exactly why constraints matter.",
  min_variance: "Minimize w'Σw. It ignores expected returns entirely, so it is the most robust objective to estimation error.",
  target_return: "Minimize variance while requiring expected return to be at least your target.",
  risk_parity: "Equalize each asset's contribution to portfolio risk, rather than its share of capital.",
  equal_weight: "1/N across the universe. Not an optimization — a baseline worth beating.",
};

function OptimizeResultView({ result, onSave, saving, savedRunId }: { result: OptimizeResult; onSave: () => void; saving: boolean; savedRunId: string | null }) {
  const cur = result.current.metrics;
  const opt = result.optimized.metrics;
  const changes = result.changes.filter((c) => Math.abs(c.current_weight) > 1e-6 || Math.abs(c.optimized_weight) > 1e-6);
  const donutKeys = [...changes]
    .sort((a, b) => b.current_weight - a.current_weight || b.optimized_weight - a.optimized_weight)
    .map((c) => c.ticker);

  const comparison = [
    { metric: "Expected return", current: cur.expected_return, optimized: opt.expected_return, fmt: "pct", higherBetter: true },
    { metric: "Volatility", current: cur.volatility, optimized: opt.volatility, fmt: "pct", higherBetter: false },
    { metric: "Sharpe ratio", current: cur.sharpe, optimized: opt.sharpe, fmt: "num", higherBetter: true },
    { metric: "95% VaR (1 day)", current: cur.var_hist, optimized: opt.var_hist, fmt: "pct", higherBetter: false },
    { metric: "Expected Shortfall", current: cur.es_hist, optimized: opt.es_hist, fmt: "pct", higherBetter: false },
    { metric: "Max drawdown (window)", current: cur.max_drawdown, optimized: opt.max_drawdown, fmt: "pct", higherBetter: true },
    { metric: "Market beta", current: cur.beta, optimized: opt.beta, fmt: "num", higherBetter: false },
  ];

  return (
    <>
      {result.warnings.map((w) => (
        <Alert key={w} kind="warning">
          {w}
        </Alert>
      ))}

      <Card className="card-pad">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Badge kind="brand">{result.objective_label}</Badge>
            <p className="mt-2 text-sm text-ink-2">
              Capital {money(result.capital)} · turnover to reach the target allocation {pct(result.turnover, 0)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={onSave} loading={saving}>
              <Save className="h-4 w-4" /> Save this run
            </Button>
            <Link href="/rebalance" className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full bg-brand-600 px-4 text-[13px] font-medium text-white hover:bg-[#0077ed]">
              Build the trade list <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
        {savedRunId ? (
          <p className="mt-3 text-xs text-pos">Saved. It is now available on the rebalance and what-if pages.</p>
        ) : null}
      </Card>

      {/* Explanation */}
      <Card>
        <CardHead title="What the optimizer is telling you" />
        <div className="card-pad">
          <ul className="space-y-2.5">
            {result.explanation.map((line) => (
              <li key={line} className="flex gap-2.5 text-sm leading-relaxed text-ink-2">
                <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                {line}
              </li>
            ))}
          </ul>
        </div>
      </Card>

      {/* Current vs optimized metrics */}
      <Card>
        <CardHead title={`${result.baseline_label} vs optimized`} subtitle="Both columns use the same estimation window and the same inputs." />
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th scope="col">Metric</th>
                <th scope="col" className="text-right">{result.baseline_label}</th>
                <th scope="col" className="text-right">Optimized</th>
                <th scope="col" className="text-right">Change</th>
              </tr>
            </thead>
            <tbody>
              {comparison.map((row) => {
                const f = (v: number | null) => (row.fmt === "pct" ? pct(v, 2) : num(v));
                const diff = row.current !== null && row.optimized !== null ? row.optimized - row.current : null;
                const good = diff === null ? null : (diff > 0) === row.higherBetter;
                return (
                  <tr key={row.metric}>
                    <td className="text-ink-2">{row.metric}</td>
                    <td className="num text-right">{f(row.current)}</td>
                    <td className="num text-right font-medium">{f(row.optimized)}</td>
                    <td className={`num text-right ${diff === null || Math.abs(diff) < 1e-9 ? "text-ink-3" : good ? "text-pos" : "text-neg"}`}>
                      {diff === null ? "–" : row.fmt === "pct" ? pct(diff, 2, true) : (diff > 0 ? "+" : "") + num(diff)}
                    </td>
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

      <StatRow cols={4}>
        <Card className="card-pad">
          <Stat label="Expected return" value={pct(opt.expected_return)} delta={opt.expected_return !== null && cur.expected_return !== null ? opt.expected_return - cur.expected_return : null} deltaLabel="vs current" />
        </Card>
        <Card className="card-pad">
          <Stat label="Volatility" value={pct(opt.volatility)} delta={opt.volatility !== null && cur.volatility !== null ? opt.volatility - cur.volatility : null} deltaLabel="vs current" deltaIsGood={false} />
        </Card>
        <Card className="card-pad">
          <Stat label="Sharpe ratio" value={num(opt.sharpe)} delta={opt.sharpe !== null && cur.sharpe !== null ? (opt.sharpe - cur.sharpe) / Math.abs(cur.sharpe || 1) : null} deltaLabel="relative" />
        </Card>
        <Card className="card-pad">
          <Stat label="Turnover to get there" value={pct(result.turnover, 0)} hint="sum of |target − current|" />
        </Card>
      </StatRow>

      {/* Allocations: one color per ticker across both donuts, ordered by what you hold today. */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CardHead title={`${result.baseline_label} allocation`} />
          <div className="card-pad">
            <AllocationDonut data={Object.entries(result.current.weights).filter(([, w]) => w > 0.0005).map(([name, weight]) => ({ name, weight }))} colorKeys={donutKeys} height={220} />
          </div>
        </Card>
        <Card>
          <CardHead title="Optimized allocation" />
          <div className="card-pad">
            <AllocationDonut data={Object.entries(result.optimized.weights).filter(([, w]) => w > 0.0005).map(([name, weight]) => ({ name, weight }))} colorKeys={donutKeys} height={220} />
          </div>
        </Card>
      </div>

      <Card>
        <CardHead title="Weight changes" subtitle="How much of the portfolio moves into or out of each position." />
        <div className="card-pad">
          <DeltaBars data={changes.map((c) => ({ ticker: c.ticker, change: c.change }))} categoryKey="ticker" valueKey="change" format="pct" tone="change" valueLabel="Weight change" />
        </div>
      </Card>

      <Card>
        <CardHead title="Risk contribution: current vs optimized" help={<>Risk contribution RC&#7522; = w&#7522;(&Sigma;w)&#7522;/&sigma;&#7526;, shown as a share of total portfolio volatility. Risk parity makes these equal; maximum Sharpe rarely does.</>} />
        <div className="card-pad">
          <GroupedBars
            data={changes.map((c) => ({ ticker: c.ticker, current: c.current_risk_pct, optimized: c.optimized_risk_pct }))}
            categoryKey="ticker"
            series={[
              { key: "current", label: `${result.baseline_label} risk share`, color: SERIES[0] },
              { key: "optimized", label: "Optimized risk share", color: SERIES[1] },
            ]}
          />
        </div>
      </Card>

      <Card>
        <CardHead title="Target allocation and implied trades" subtitle="Values use your current portfolio value; the rebalance page turns this into a costed trade list." />
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th scope="col">Asset</th>
                <th scope="col" className="hidden sm:table-cell">Sector</th>
                <th scope="col" className="text-right">Current</th>
                <th scope="col" className="text-right">Target</th>
                <th scope="col" className="text-right">Change</th>
                <th scope="col" className="text-right">Target value</th>
                <th scope="col" className="text-right">Trade</th>
              </tr>
            </thead>
            <tbody>
              {changes.map((c) => (
                <tr key={c.ticker}>
                  <td>
                    <span className="font-medium">{c.ticker}</span>
                    <span className="block text-xs text-ink-3">{c.name}</span>
                  </td>
                  <td className="hidden text-ink-2 sm:table-cell">{c.sector}</td>
                  <td className="num text-right">{pct(c.current_weight, 1)}</td>
                  <td className="num text-right font-medium">{pct(c.optimized_weight, 1)}</td>
                  <td className={`num text-right ${tone(c.change)}`}>{pct(c.change, 1, true)}</td>
                  <td className="num text-right">{money(c.target_value)}</td>
                  <td className={`num text-right ${tone(c.trade_value)}`}>
                    {money(c.trade_value, { signed: true })}
                    {c.shares !== null ? <span className="block text-xs font-normal text-ink-3">{num(c.shares, 2)} units</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
