"use client";

import { useState } from "react";
import useSWR from "swr";

import { GroupedBars, Histogram } from "@/components/charts/bars";
import { SERIES, BENCH } from "@/components/charts/base";
import { CorrelationHeatmap } from "@/components/charts/heatmap";
import { DrawdownChart, TimeSeries } from "@/components/charts/lines";
import { AssetScatter } from "@/components/charts/scatter";
import { InputsNote, PageHeader } from "@/components/layout/page-header";
import { NoPortfolio } from "@/components/portfolio/pickers";
import { Disclosure, EstimationControls, type EstimationState } from "@/components/portfolio/settings-panel";
import { Alert, Button, Card, CardHead, SegmentedControl, Skeleton, Stat, StatRow } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { date, money, num, pct } from "@/lib/format";
import { usePortfolios } from "@/lib/portfolio-context";
import type { Preferences, RiskPayload } from "@/lib/types";

const CONFIDENCES = [
  { value: "0.9", label: "90%" },
  { value: "0.95", label: "95%" },
  { value: "0.99", label: "99%" },
];

const HORIZONS = [
  { value: "1", label: "1 day" },
  { value: "5", label: "1 week" },
  { value: "21", label: "1 month" },
];

export default function RiskPage() {
  const { activeId, loading } = usePortfolios();
  const { data: prefs } = useSWR<Preferences>("/me/preferences");
  const [confidence, setConfidence] = useState("0.95");
  const [horizon, setHorizon] = useState("1");
  const [est, setEst] = useState<EstimationState | null>(null);
  const [data, setData] = useState<RiskPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const estimation: EstimationState = est ?? {
    lookback_days: prefs?.lookback_days ?? 756,
    return_method: prefs?.return_method ?? "historical",
    cov_method: prefs?.cov_method ?? "sample",
    risk_free_rate: prefs?.risk_free_rate ?? 0.04,
  };

  const key = activeId ? `${activeId}|${confidence}|${horizon}|${JSON.stringify(estimation)}` : null;
  const { data: auto, error: autoError, isLoading } = useSWR<RiskPayload>(
    key,
    () =>
      api<RiskPayload>("/risk/metrics", {
        body: { portfolio_id: activeId, confidence: Number(confidence), horizon_days: Number(horizon), ...estimation },
      }),
    { keepPreviousData: true },
  );
  const payload = data ?? auto;

  async function rerun() {
    setBusy(true);
    setError(null);
    try {
      setData(
        await api<RiskPayload>("/risk/metrics", {
          body: { portfolio_id: activeId, confidence: Number(confidence), horizon_days: Number(horizon), ...estimation },
        }),
      );
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
        title="Risk analysis"
        subtitle="Where the risk in your portfolio actually sits, how bad the tail has been, and how your holdings move together."
      >
        <SegmentedControl value={confidence} onChange={setConfidence} options={CONFIDENCES} ariaLabel="Confidence level" />
        <SegmentedControl value={horizon} onChange={setHorizon} options={HORIZONS} ariaLabel="Horizon" />
      </PageHeader>

      {error || autoError ? <Alert kind="error">{errorMessage(error ?? autoError)}</Alert> : null}
      {isLoading && !payload ? <Skeleton className="h-96" /> : null}

      {payload ? (
        <div className="space-y-5">
          <Card className="card-pad">
            <StatRow cols={6}>
              <Stat
                label="Volatility"
                value={pct(payload.metrics.volatility)}
                hint="annualized"
                help={<>&sigma;&#7526; = sqrt(w&apos;&Sigma;w), annualized by multiplying the daily figure by sqrt(252).</>}
              />
              <Stat label="Sharpe ratio" value={num(payload.metrics.sharpe)} hint={`rf ${pct(payload.inputs.risk_free_rate, 1)}`} />
              <Stat
                label="Sortino ratio"
                value={num(payload.metrics.sortino)}
                hint="downside only"
                help={<>Like Sharpe, but the denominator counts only returns below the risk-free rate, so upside volatility is not penalized.</>}
              />
              <Stat label="Max drawdown" value={pct(payload.drawdown.max_drawdown)} hint={`${payload.drawdown.max_duration_days} days underwater`} />
              <Stat
                label={`${pct(payload.confidence, 0)} VaR (${payload.horizon_days}d)`}
                value={pct(payload.metrics.var_hist)}
                hint={money(payload.money.var_hist, { compact: true })}
                deltaIsGood={false}
                help={<>Historical VaR: the {pct(1 - payload.confidence, 0)} lower percentile of {payload.horizon_days}-day portfolio returns in this window, reported as a positive loss.</>}
              />
              <Stat
                label="Expected Shortfall"
                value={pct(payload.metrics.es_hist)}
                hint={money(payload.money.es_hist, { compact: true })}
                help={<>Mean loss across the observations at or beyond the VaR threshold. Always at least as large as VaR.</>}
              />
            </StatRow>
            <InputsNote inputs={payload.inputs} className="mt-4 border-t border-hair pt-3" />
          </Card>

          {/* VaR methods table */}
          <Card>
            <CardHead
              title="Tail risk by method"
              subtitle={`Horizon ${payload.horizon_days} trading day${payload.horizon_days === 1 ? "" : "s"} · portfolio value ${money(payload.capital)}`}
              help={
                <>
                  <strong>Historical</strong> reads the percentile straight off the realized return distribution, so it keeps the
                  fat tails that actually happened. <strong>Parametric</strong> assumes normal returns with the estimated mean and
                  volatility, which usually understates extremes. Never show a VaR without saying which method produced it.
                </>
              }
            />
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th scope="col">Confidence</th>
                    <th scope="col" className="text-right">Historical VaR</th>
                    <th scope="col" className="text-right">Historical ES</th>
                    <th scope="col" className="text-right">Parametric VaR</th>
                    <th scope="col" className="text-right">Parametric ES</th>
                    <th scope="col" className="text-right">Historical VaR in money</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(payload.var_table).map(([c, row]) => (
                    <tr key={c}>
                      <td className="font-medium">{pct(Number(c), 0)}</td>
                      <td className="num text-right">{pct(row.var_hist, 2)}</td>
                      <td className="num text-right">{pct(row.es_hist, 2)}</td>
                      <td className="num text-right text-ink-2">{pct(row.var_param, 2)}</td>
                      <td className="num text-right text-ink-2">{pct(row.es_param, 2)}</td>
                      <td className="num text-right">{money((row.var_hist ?? 0) * payload.capital)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Risk contribution */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Card>
              <CardHead
                title="Risk contribution vs capital weight"
                subtitle="The gap between these two bars is the point of this page."
                help={<>RC&#7522; = w&#7522; &times; (&Sigma;w)&#7522; / &sigma;&#7526;. The contributions sum exactly to portfolio volatility, so each bar is that asset&apos;s share of total risk.</>}
              />
              <div className="card-pad">
                <GroupedBars
                  data={payload.risk_contribution
                    .slice()
                    .sort((a, b) => b.risk_pct - a.risk_pct)
                    .map((r) => ({ ticker: r.ticker, weight: r.weight, risk_pct: r.risk_pct }))}
                  categoryKey="ticker"
                  series={[
                    { key: "weight", label: "Capital weight", color: SERIES[0] },
                    { key: "risk_pct", label: "Risk contribution", color: SERIES[1] },
                  ]}
                />
              </div>
            </Card>

            <Card>
              <CardHead title="Concentration" subtitle="Owning many names is not the same as being diversified." />
              <div className="card-pad space-y-4">
                <StatRow cols={3}>
                  <Stat
                    label="Effective holdings"
                    value={num(payload.concentration.effective_n, 1)}
                    hint={`${payload.correlation.tickers.length} actual`}
                    help={<>1 / &Sigma;w&#7522;&sup2; (inverse Herfindahl). Equal weights across N assets give exactly N.</>}
                  />
                  <Stat label="Largest position" value={pct(payload.concentration.top1, 0)} />
                  <Stat label="Top 3 combined" value={pct(payload.concentration.top3, 0)} />
                </StatRow>
                <div>
                  <p className="label mb-1.5">Risk by sector</p>
                  <ul className="space-y-1.5">
                    {Object.entries(payload.sector_risk).map(([s, w], i) => (
                      <li key={s} className="flex items-center gap-2 text-xs">
                        <span className="w-32 shrink-0 truncate text-ink-2">{s}</span>
                        <span className="h-2 flex-1 overflow-hidden rounded-full bg-black/[0.05]">
                          <span className="block h-full rounded-full" style={{ width: `${Math.max(w * 100, 1)}%`, background: SERIES[i % SERIES.length] }} />
                        </span>
                        <span className="num w-20 shrink-0 text-right text-ink">
                          {pct(w, 0)}
                          <span className="text-ink-3"> / {pct(payload.sector_exposure[s] ?? 0, 0)}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs text-ink-3">Share of risk / share of capital.</p>
                </div>
              </div>
            </Card>
          </div>

          {/* Correlation */}
          <Card>
            <CardHead
              title="Correlation matrix"
              subtitle={payload.correlation.average_pairwise !== null ? `Average pairwise correlation ${num(payload.correlation.average_pairwise)}` : undefined}
              help={
                <>
                  Correlation(X,Y) = Cov(X,Y) / (&sigma;&#7368;&sigma;&#7366;), standardized to the −1 to +1 range. High positive
                  correlation means little diversification benefit. Correlation is a statistical relationship, not a causal one.
                </>
              }
            />
            <div className="card-pad">
              <CorrelationHeatmap tickers={payload.correlation.tickers} matrix={payload.correlation.matrix} />
            </div>
          </Card>

          {/* Performance & drawdown */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Card>
              <CardHead title="Growth of the current allocation" subtitle="Holding today's weights constant through the window (daily rebalanced)." />
              <div className="card-pad">
                <TimeSeries
                  data={payload.series}
                  series={[
                    { key: "value", label: "Portfolio (indexed to 1.0)", color: SERIES[0] },
                    { key: "benchmark", label: "SPY", color: BENCH, dashed: true },
                  ]}
                  format="plain"
                  height={260}
                  referenceY={1}
                />
              </div>
            </Card>
            <Card>
              <CardHead
                title="Drawdown"
                subtitle={
                  payload.drawdown.peak_date
                    ? `Peak ${date(payload.drawdown.peak_date)} → trough ${date(payload.drawdown.trough_date)}${payload.drawdown.recovery_date ? ` → recovered ${date(payload.drawdown.recovery_date)}` : " (not yet recovered)"}`
                    : undefined
                }
                help={<>Drawdown(t) = V&#8339; / max(V&#8320;..V&#8339;) − 1, so it is never positive. Two portfolios can share a maximum drawdown and have very different recovery times.</>}
              />
              <div className="card-pad">
                <DrawdownChart data={payload.series} height={260} />
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Card>
              <CardHead
                title="Daily return distribution"
                subtitle={`Days at or beyond the ${pct(payload.confidence, 0)} VaR threshold are highlighted.`}
              />
              <div className="card-pad">
                <Histogram data={payload.histogram} marker={-(payload.metrics.var_hist ?? 0)} markerLabel={`Worse than ${pct(payload.confidence, 0)} VaR`} height={240} />
              </div>
            </Card>
            <Card>
              <CardHead
                title="Rolling 3-month volatility"
                subtitle="Risk is not constant: regimes change."
                help={<>63-day rolling standard deviation of portfolio returns, annualized. Gaps at the start are the window warming up.</>}
              />
              <div className="card-pad">
                <TimeSeries data={payload.series} series={[{ key: "rolling_vol", label: "Annualized volatility", color: SERIES[1] }]} format="pct" height={240} />
              </div>
            </Card>
          </div>

          {/* Factor exposure */}
          <Card>
            <CardHead
              title="Market exposure"
              subtitle={payload.factor_exposure ? `Portfolio beta ${num(payload.factor_exposure.beta)} vs SPY` : undefined}
              help={<>Single-factor model R&#7522; = &alpha;&#7522; + &beta;&#7522;R&#8344; + &epsilon;&#7522; estimated by OLS on daily returns. Portfolio beta is the weighted sum of asset betas. Alpha is a regression intercept, not proof of skill.</>}
            />
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.2fr]">
              <div className="card-pad">
                <AssetScatter data={payload.asset_stats.map((a) => ({ ticker: a.ticker, beta: a.beta, expected_return: a.expected_return }))} height={280} />
              </div>
              <div className="overflow-x-auto">
                <table className="table-base">
                  <thead>
                    <tr>
                      <th scope="col">Asset</th>
                      <th scope="col" className="text-right">Weight</th>
                      <th scope="col" className="text-right">Exp. return</th>
                      <th scope="col" className="text-right">Volatility</th>
                      <th scope="col" className="text-right">Beta</th>
                      <th scope="col" className="text-right">Worst day</th>
                      <th scope="col" className="text-right">Risk share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payload.asset_stats.map((a) => {
                      const rc = payload.risk_contribution.find((r) => r.ticker === a.ticker);
                      return (
                        <tr key={a.ticker}>
                          <td>
                            <span className="font-medium">{a.ticker}</span>
                            <span className="block text-xs text-ink-3">{a.sector}</span>
                          </td>
                          <td className="num text-right">{pct(payload.weights[a.ticker], 1)}</td>
                          <td className="num text-right">{pct(a.expected_return, 1)}</td>
                          <td className="num text-right">{pct(a.volatility, 1)}</td>
                          <td className="num text-right">{num(a.beta)}</td>
                          <td className="num text-right text-neg">{pct(a.worst_day, 1)}</td>
                          <td className="num text-right font-medium">{pct(rc?.risk_pct, 1)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </Card>

          <Card>
            <Disclosure title="Estimation settings">
              <EstimationControls value={estimation} onChange={setEst} />
              <div className="mt-4">
                <Button size="sm" onClick={rerun} loading={busy}>
                  Recalculate
                </Button>
              </div>
            </Disclosure>
          </Card>
        </div>
      ) : null}
    </>
  );
}
