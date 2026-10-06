"use client";

import { Check, X } from "lucide-react";
import { useState } from "react";
import useSWR from "swr";

import { BENCH, SERIES } from "@/components/charts/base";
import { DrawdownChart, TimeSeries } from "@/components/charts/lines";
import { COV_LABEL, PageHeader, RETURN_LABEL } from "@/components/layout/page-header";
import { NoPortfolio } from "@/components/portfolio/pickers";
import { Alert, Badge, Button, Card, CardHead, Field, Select, Skeleton, Slider, Stat, StatRow, Toggle } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { date, money, monthYear, num, pct } from "@/lib/format";
import { usePortfolios } from "@/lib/portfolio-context";
import type { BacktestResult, Preferences } from "@/lib/types";

const STRATEGIES = [
  { value: "equal_weight", label: "Equal weight", blurb: "Same weight in every asset, rebalanced on schedule. The benchmark that is hardest to beat." },
  { value: "min_variance", label: "Minimum variance", blurb: "Lowest estimated portfolio volatility each period." },
  { value: "max_sharpe", label: "Maximum Sharpe", blurb: "Highest estimated risk-adjusted return. Most sensitive to estimation error." },
  { value: "risk_parity", label: "Risk parity", blurb: "Every asset contributes the same share of portfolio risk." },
  { value: "current", label: "Your weights", blurb: "Your current allocation, rebalanced back to it on the same schedule." },
];

const FREQUENCIES = [
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "annual", label: "Annually" },
];

const WINDOWS = [
  { value: "126", label: "6 months" },
  { value: "252", label: "1 year" },
  { value: "504", label: "2 years" },
  { value: "756", label: "3 years" },
];

export default function BacktestPage() {
  const { activeId, loading } = usePortfolios();
  const { data: prefs } = useSWR<Preferences>("/me/preferences");

  const [picked, setPicked] = useState<string[]>(["equal_weight", "min_variance", "max_sharpe", "risk_parity", "current"]);
  const [frequency, setFrequency] = useState("quarterly");
  const [window, setWindow] = useState(252);
  const [costRate, setCostRate] = useState<number | null>(null);
  const [data, setData] = useState<BacktestResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cost = costRate ?? prefs?.cost_rate ?? 0.001;
  const body = {
    portfolio_id: activeId,
    strategies: picked,
    frequency,
    estimation_window: window,
    cost_rate: cost,
  };

  const key = activeId && picked.length ? `bt|${JSON.stringify(body)}` : null;
  const { data: auto, error: autoError, isLoading } = useSWR<BacktestResult>(
    key,
    () => api<BacktestResult>("/backtest", { body }),
    { keepPreviousData: true, revalidateOnFocus: false },
  );
  const result = data ?? auto;

  async function rerun() {
    setBusy(true);
    setError(null);
    try {
      setData(await api<BacktestResult>("/backtest", { body }));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Skeleton className="h-72" />;
  if (!activeId) return <NoPortfolio />;

  const keys = result?.strategies ?? [];
  const colorOf = (k: string) => (k === "benchmark" ? BENCH : SERIES[keys.filter((x) => x !== "benchmark").indexOf(k) % SERIES.length]);
  const seriesDefs = keys.map((k) => ({
    key: k,
    label: k === "benchmark" ? "S&P 500 (SPY)" : (result?.labels[k] ?? k),
    color: colorOf(k),
    dashed: k === "benchmark",
  }));

  const best = result
    ? Object.entries(result.metrics).sort((a, b) => (b[1].sharpe ?? -99) - (a[1].sharpe ?? -99))[0]
    : null;

  return (
    <>
      <PageHeader
        title="Walk-forward backtest"
        subtitle="Rebuild each strategy period by period using only the data available at the time, then compare what they would have returned."
        help={
          <>
            At every rebalance date the optimizer sees a window of history that <em>ends before that date</em>, picks weights, and
            holds them until the next rebalance. Returns between rebalances are earned on drifting weights, and transaction costs
            are charged on the turnover. That is what makes it walk-forward rather than a curve fit.
          </>
        }
      >
        <Button variant="secondary" size="sm" onClick={rerun} loading={busy}>
          Re-run
        </Button>
      </PageHeader>

      {error || autoError ? <Alert kind="error">{errorMessage(error ?? autoError)}</Alert> : null}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card>
            <CardHead title="Strategies" subtitle="Each one is rebuilt from scratch at every rebalance." />
            <div className="card-pad space-y-1">
              {STRATEGIES.map((s) => (
                <Toggle
                  key={s.value}
                  checked={picked.includes(s.value)}
                  onChange={(on) => setPicked((prev) => (on ? [...prev, s.value] : prev.filter((x) => x !== s.value)))}
                  label={s.label}
                  hint={s.blurb}
                />
              ))}
              {picked.length === 0 ? <p className="text-xs text-warn">Pick at least one strategy.</p> : null}
            </div>
          </Card>

          <Card>
            <CardHead title="Rules of the test" />
            <div className="card-pad space-y-4">
              <Field label="Rebalance frequency" htmlFor="freq" hint="More frequent rebalancing tracks the target better and costs more.">
                <Select id="freq" value={frequency} onChange={setFrequency} options={FREQUENCIES} />
              </Field>
              <Field label="Estimation window" htmlFor="win" hint="How much history the optimizer sees at each rebalance.">
                <Select id="win" value={String(window)} onChange={(v) => setWindow(Number(v))} options={WINDOWS} />
              </Field>
              <Slider
                label="Transaction cost per trade"
                display={`${(cost * 100).toFixed(2)}%`}
                min={0}
                max={0.01}
                step={0.0005}
                value={cost}
                onChange={setCostRate}
              />
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          {isLoading && !result ? <Skeleton className="h-[420px]" /> : null}
          {result ? (
            <>
              {best ? (
                <Card className="card-pad">
                  <StatRow cols={4}>
                    <Stat label="Period tested" value={`${monthYear(result.start)} – ${monthYear(result.end)}`} hint={`${result.frequency} rebalancing`} />
                    <Stat label="Best Sharpe over this period" value={num(best[1].sharpe)} hint={best[1].label} />
                    <Stat label="Its total return" value={pct(best[1].total_return, 1, true)} hint={`from ${money(result.initial_capital)}`} />
                    <Stat label="Its worst drawdown" value={pct(best[1].max_drawdown, 1)} hint={`${best[1].rebalances} rebalances`} />
                  </StatRow>
                </Card>
              ) : null}

              <Card>
                <CardHead
                  title="Portfolio value over time"
                  subtitle={`Each line starts at ${money(result.initial_capital)} and is net of ${(result.cost_rate * 100).toFixed(2)}% costs per trade.`}
                />
                <div className="card-pad">
                  <TimeSeries data={result.series} series={seriesDefs} height={340} />
                  <p className="mt-3 text-xs text-ink-3">
                    Tested over {result.observations.toLocaleString()} trading days ({result.start} to {result.end}) · each
                    rebalance re-estimates from the previous {result.lookback} days only · expected returns:{" "}
                    {RETURN_LABEL[result.return_method] ?? result.return_method} · covariance:{" "}
                    {COV_LABEL[result.cov_method] ?? result.cov_method} · risk-free rate {(result.risk_free_rate * 100).toFixed(1)}% ·
                    annualized with 252 trading days
                  </p>
                </div>
              </Card>

              <Card>
                <CardHead
                  help={
                    <>
                    <p>
                      CAGR is the compound annual growth rate over the test period. Volatility and Sharpe use daily backtest
                      returns annualized by &radic;252. Calmar is CAGR divided by the absolute worst drawdown. Average turnover is
                      the mean of <span className="num">&Sigma;|new − drifted|</span> across rebalance dates.
                    </p>
                    <p>
                      Costs are charged as {(result.cost_rate * 100).toFixed(2)}% of traded notional at each rebalance and are
                      already inside every return figure above.
                    </p>
                    </>
                  } title="Results" subtitle="Same period, same costs, same data for every strategy." />
                <div className="overflow-x-auto">
                  <table className="table-base table-compact">
                    <thead>
                      <tr>
                        <th scope="col">Strategy</th>
                        <th scope="col" className="text-right">Final value</th>
                        <th scope="col" className="text-right">Total return</th>
                        <th scope="col" className="text-right">CAGR</th>
                        <th scope="col" className="text-right">Volatility</th>
                        <th scope="col" className="text-right">Sharpe</th>
                        <th scope="col" className="text-right">Max drawdown</th>
                        <th scope="col" className="text-right">Calmar</th>
                        <th scope="col" className="text-right">Avg turnover</th>
                        <th scope="col" className="text-right">Total costs</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(result.metrics).map(([k, m]) => (
                        <tr key={k}>
                          <td className="min-w-[10rem] whitespace-normal">
                            <span className="inline-flex items-center gap-2 font-medium">
                              <span
                                aria-hidden
                                className="h-2.5 w-2.5 shrink-0 rounded-full"
                                style={{ background: colorOf(k) }}
                              />
                              {k === "benchmark" ? "S&P 500 (SPY)" : m.label}
                            </span>
                          </td>
                          <td className="num text-right">{money(m.final_value)}</td>
                          <td className="num text-right">{pct(m.total_return, 1, true)}</td>
                          <td className="num text-right">{pct(m.cagr, 1)}</td>
                          <td className="num text-right">{pct(m.volatility, 1)}</td>
                          <td className="num text-right font-medium">{num(m.sharpe)}</td>
                          <td className="num text-right">{pct(m.max_drawdown, 1)}</td>
                          <td className="num text-right">{num(m.calmar)}</td>
                          <td className="num text-right">{m.avg_turnover > 0 ? pct(m.avg_turnover, 1) : "—"}</td>
                          <td className="num text-right">{m.total_costs > 0 ? money(m.total_costs) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              <Card>
                <CardHead title="Drawdowns" subtitle="How far each strategy sat below its own previous peak." />
                <div className="card-pad space-y-5">
                  {keys.map((k) => (
                    <div key={k}>
                      <p className="label mb-1">
                        {k === "benchmark" ? "S&P 500 (SPY)" : (result.labels[k] ?? k)} · worst {pct(result.metrics[k]?.max_drawdown, 1)}
                      </p>
                      <DrawdownChart
                        data={result.series.map((r) => ({ date: String(r.date), drawdown: Number(r[`${k}_dd`] ?? 0) }))}
                        height={140}
                      />
                    </div>
                  ))}
                </div>
              </Card>

              <Card>
                <CardHead title="No look-ahead: the checks" subtitle="A backtest is only worth reading if it could not see the future." />
                <div className="card-pad space-y-2">
                  {[
                    ["Estimation windows end strictly before each rebalance date", result.integrity.estimation_windows_end_before_rebalance],
                    ["No strategy uses data after the day it trades", result.integrity.no_lookahead],
                    ["Every strategy is scored on the same evaluation window", result.integrity.same_evaluation_window],
                    ["Transaction costs are charged on turnover", result.integrity.transaction_costs_applied],
                  ].map(([label, ok]) => (
                    <p key={String(label)} className="flex items-start gap-2 text-sm text-ink-2">
                      {ok ? (
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-pos" aria-label="Passed" />
                      ) : (
                        <X className="mt-0.5 h-4 w-4 shrink-0 text-neg" aria-label="Failed" />
                      )}
                      {label}
                    </p>
                  ))}
                  <p className="pt-1 text-xs text-ink-3">
                    {result.integrity.rebalance_dates.length} rebalance dates, the first on {date(result.integrity.rebalance_dates[0] ?? result.start)}.
                  </p>
                </div>
              </Card>

              <Card>
                <CardHead title="Rebalance log" subtitle="What the optimizer saw, and what it traded." />
                <div className="max-h-[420px] overflow-auto">
                  <table className="table-base">
                    <thead>
                      <tr>
                        <th scope="col">Date</th>
                        <th scope="col">Strategy</th>
                        <th scope="col">Data window used</th>
                        <th scope="col" className="text-right">Turnover</th>
                        <th scope="col" className="text-right">Cost</th>
                        <th scope="col">Largest positions chosen</th>
                      </tr>
                    </thead>
                    <tbody>
                      {keys.flatMap((k) =>
                        (result.rebalances[k] ?? []).map((r) => (
                          <tr key={`${k}-${r.date}`}>
                            <td className="num whitespace-nowrap">{date(r.date)}</td>
                            <td>{k === "benchmark" ? "S&P 500 (SPY)" : (result.labels[k] ?? k)}</td>
                            <td className="num whitespace-nowrap text-xs text-ink-3">
                              {r.window_start && r.window_end ? `${date(r.window_start)} → ${date(r.window_end)}` : "—"}
                            </td>
                            <td className="num text-right">{pct(r.turnover, 1)}</td>
                            <td className="num text-right">{money(r.cost)}</td>
                            <td className="text-xs text-ink-2">
                              {Object.entries(r.weights ?? {})
                                .sort((a, b) => b[1] - a[1])
                                .slice(0, 3)
                                .map(([t, w]) => `${t} ${pct(w, 0)}`)
                                .join(" · ")}
                              {r.note ? <span className="block text-warn">{r.note}</span> : null}
                            </td>
                          </tr>
                        )),
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>

              <Alert kind="warning" title="How much to trust this">
                One historical path is a single sample. The ranking above can flip with a different period, a different
                estimation window, or a different rebalance frequency — try changing them on the left and watch what moves.
                Strategies that rely on estimated expected returns, maximum Sharpe above all, tend to look better in a backtest
                than they behave in practice.{" "}
                <Badge kind="neutral">{result.tickers.length} assets</Badge>{" "}
                <Badge kind="neutral">max weight {pct(result.max_single_asset, 0)}</Badge>
              </Alert>
            </>
          ) : null}
        </div>
      </div>
    </>
  );
}
