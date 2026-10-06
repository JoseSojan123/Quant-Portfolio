"use client";

import { useState } from "react";
import useSWR from "swr";

import { BENCH, Legend, SERIES } from "@/components/charts/base";
import { Histogram } from "@/components/charts/bars";
import { FanChart, SamplePaths } from "@/components/charts/lines";
import { InputsNote, PageHeader } from "@/components/layout/page-header";
import { NoPortfolio } from "@/components/portfolio/pickers";
import { Disclosure, EstimationControls, type EstimationState } from "@/components/portfolio/settings-panel";
import { Alert, Button, Card, CardHead, Field, NumberInput, Select, Skeleton, Slider, Stat, StatRow } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { money, pct } from "@/lib/format";
import { usePortfolios } from "@/lib/portfolio-context";
import type { MonteCarloResult, Preferences } from "@/lib/types";

/** Enough individual paths to show texture without turning into a solid band. */
const SAMPLE_PATHS = 12;

const METHODS = [
  { value: "normal", label: "Multivariate normal" },
  { value: "student_t", label: "Student-t (fat tails)" },
  { value: "bootstrap", label: "Historical bootstrap" },
];

const HORIZONS = [
  { value: "21", label: "1 month" },
  { value: "63", label: "3 months" },
  { value: "126", label: "6 months" },
  { value: "252", label: "1 year" },
  { value: "504", label: "2 years" },
  { value: "1260", label: "5 years" },
];

export default function MonteCarloPage() {
  const { activeId, loading } = usePortfolios();
  const { data: prefs } = useSWR<Preferences>("/me/preferences");

  const [horizon, setHorizon] = useState(252);
  const [sims, setSims] = useState(5000);
  const [method, setMethod] = useState("normal");
  const [lossThreshold, setLossThreshold] = useState(0.1);
  const [target, setTarget] = useState<number | "">("");
  const [est, setEst] = useState<EstimationState | null>(null);
  const [data, setData] = useState<MonteCarloResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const estimation: EstimationState = est ?? {
    lookback_days: prefs?.lookback_days ?? 756,
    return_method: prefs?.return_method ?? "historical",
    cov_method: prefs?.cov_method ?? "sample",
    risk_free_rate: prefs?.risk_free_rate ?? 0.04,
  };

  const body = {
    portfolio_id: activeId,
    horizon_days: horizon,
    n_sims: sims,
    method,
    loss_threshold: lossThreshold,
    ...(typeof target === "number" && target > 0 ? { target_value: target } : {}),
    ...estimation,
  };

  const key = activeId ? `mc|${activeId}|${JSON.stringify(body)}` : null;
  const { data: auto, error: autoError, isLoading } = useSWR<MonteCarloResult>(
    key,
    () => api<MonteCarloResult>("/simulation/monte-carlo", { body }),
    { keepPreviousData: true },
  );
  const payload = data ?? auto;

  async function rerun() {
    setBusy(true);
    setError(null);
    try {
      setData(await api<MonteCarloResult>("/simulation/monte-carlo", { body: { ...body, seed: Math.floor(Math.random() * 1e9) } }));
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
        title="Monte Carlo simulation"
        subtitle="Thousands of possible futures for your portfolio, drawn from the estimated return distribution."
        help={
          <>
            Each simulation draws a sequence of daily portfolio returns and compounds them from today&apos;s value. The spread of
            terminal values is the distribution shown here. It is <em>conditional on the model</em>: change the window, the
            estimator or the distribution and the fan changes with it. It is not a forecast of what will happen.
          </>
        }
      >
        <Button variant="secondary" size="sm" onClick={rerun} loading={busy}>
          Resimulate with a new seed
        </Button>
      </PageHeader>

      {error || autoError ? <Alert kind="error">{errorMessage(error ?? autoError)}</Alert> : null}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card>
            <CardHead title="Simulation settings" />
            <div className="card-pad space-y-4">
              <Field label="Horizon" htmlFor="horizon">
                <Select id="horizon" value={String(horizon)} onChange={(v) => setHorizon(Number(v))} options={HORIZONS} />
              </Field>
              <Field
                label="Return distribution"
                htmlFor="method"
                hint={
                  method === "normal"
                    ? "Symmetric and thin-tailed. Understates crash risk."
                    : method === "student_t"
                      ? "Student-t with 5 degrees of freedom, rescaled to the same covariance. Fatter tails."
                      : "Resamples actual historical days, so it keeps real skew and kurtosis."
                }
              >
                <Select id="method" value={method} onChange={setMethod} options={METHODS} />
              </Field>
              <Slider
                label="Simulations"
                display={sims.toLocaleString()}
                min={500}
                max={20000}
                step={500}
                value={sims}
                onChange={setSims}
              />
              <Slider
                label="Loss threshold to report"
                display={pct(lossThreshold, 0)}
                min={0.02}
                max={0.6}
                step={0.02}
                value={lossThreshold}
                onChange={setLossThreshold}
              />
              <Field label="Target value (optional)" htmlFor="target" hint="Reports the probability of finishing at or above this value.">
                <NumberInput id="target" value={target} onChange={setTarget} min={0} step={1000} placeholder="e.g. 120000" />
              </Field>
            </div>
            <Disclosure title="Estimation settings">
              <EstimationControls value={estimation} onChange={setEst} />
            </Disclosure>
          </Card>
        </div>

        <div className="space-y-5">
          {isLoading && !payload ? <Skeleton className="h-[420px]" /> : null}
          {payload ? (
            <>
              <Card className="card-pad">
                <StatRow cols={4}>
                  <Stat label="Starting value" value={money(payload.initial_value)} />
                  <Stat label="Median outcome" value={money(payload.terminal.median)} hint={`${pct(payload.median_return, 1, true)} total`} />
                  <Stat
                    label={`Chance of losing ${pct(payload.loss_threshold, 0)} or more`}
                    value={pct(payload.prob_loss_threshold, 1)}
                    hint={`in ${payload.n_sims.toLocaleString()} simulations`}
                  />
                  <Stat label="Chance of any loss" value={pct(payload.prob_loss, 1)} hint="finishing below today's value" />
                </StatRow>
              </Card>

              <Card>
                <CardHead
                  title="Range of outcomes over time"
                  subtitle={`${payload.n_sims.toLocaleString()} simulations · ${payload.horizon_days} trading days · ${payload.assumptions}`}
                  help={
                    <>
                      The shaded bands are percentiles of simulated portfolio value on each day, not the paths of individual
                      simulations. The median line is the 50th percentile day by day, so no single simulation follows it exactly.
                    </>
                  }
                />
                <div className="card-pad">
                  <FanChart bands={payload.bands} initialValue={payload.initial_value} targetValue={payload.target_value ?? null} height={340} />
                  {payload.target_value && payload.prob_target !== undefined ? (
                    <p className="mt-3 text-sm text-ink-2">
                      In {pct(payload.prob_target, 1)} of simulations the portfolio finishes at or above{" "}
                      <span className="num font-medium text-ink">{money(payload.target_value)}</span>.
                    </p>
                  ) : null}
                  <InputsNote inputs={payload.inputs} className="mt-3" />
                </div>
              </Card>

              <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                <Card>
                  <CardHead title="Distribution of final value" subtitle="Each bar counts simulations landing in that range." />
                  <div className="card-pad">
                    <Histogram
                      data={payload.histogram}
                      xFormat="money"
                      marker={payload.initial_value}
                      markerLabel="Ends below today's value"
                      height={240}
                    />
                  </div>
                </Card>

                <Card>
                  <CardHead title="A sample of individual paths" subtitle={`${Math.min(SAMPLE_PATHS, payload.sample_paths.length)} simulations drawn at random, to show how bumpy a single future is.`} />
                  <div className="card-pad">
                    <SamplePaths
                      paths={payload.sample_paths.slice(0, SAMPLE_PATHS)}
                      days={payload.sample_days}
                      initialValue={payload.initial_value}
                      height={240}
                    />
                    <Legend className="mt-2" items={[{ label: "One simulated path", color: SERIES[0] }, { label: "Starting value", color: BENCH, dashed: true }]} />
                  </div>
                </Card>
              </div>

              <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                <Card>
                  <CardHead title="Percentiles of final value" />
                  <div className="overflow-x-auto">
                    <table className="table-base">
                      <thead>
                        <tr>
                          <th scope="col">Percentile</th>
                          <th scope="col" className="text-right">Portfolio value</th>
                          <th scope="col" className="text-right">Total return</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          ["Worst simulation", payload.terminal.worst],
                          ["1st percentile", payload.terminal.p1],
                          ["5th percentile", payload.terminal.p5],
                          ["Median", payload.terminal.median],
                          ["Mean", payload.terminal.mean],
                          ["95th percentile", payload.terminal.p95],
                          ["99th percentile", payload.terminal.p99],
                          ["Best simulation", payload.terminal.best],
                        ].map(([label, v]) => (
                          <tr key={String(label)}>
                            <td className={label === "Median" ? "font-medium" : ""}>{label}</td>
                            <td className="num text-right">{money(Number(v))}</td>
                            <td className="num text-right text-ink-2">{pct(Number(v) / payload.initial_value - 1, 1, true)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>

                <Card>
                  <CardHead
                  help={
                    <>
                      <p>
                        Over the simulated horizon, loss is measured against today&apos;s value. VaR at 95% is the 5th percentile
                        loss across simulations; Expected Shortfall is the average loss in that worst 5%. The drawdown figures are
                        taken within each path, peak to trough, then summarized across paths.
                      </p>
                      <p>
                        Weights held fixed at {Object.entries(payload.weights).length} positions, buy and hold, with no further
                        contributions, no rebalancing and no taxes.
                      </p>
                    </>
                  } title="Simulated tail risk and drawdown" />
                  <div className="overflow-x-auto">
                    <table className="table-base">
                      <thead>
                        <tr>
                          <th scope="col">Measure</th>
                          <th scope="col" className="text-right">Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td>Simulated VaR (95%)</td>
                          <td className="num text-right">{money(payload.var_95)}</td>
                        </tr>
                        <tr>
                          <td>Simulated Expected Shortfall (95%)</td>
                          <td className="num text-right">{money(payload.es_95)}</td>
                        </tr>
                        <tr>
                          <td>Simulated VaR (99%)</td>
                          <td className="num text-right">{money(payload.var_99)}</td>
                        </tr>
                        <tr>
                          <td>Simulated Expected Shortfall (99%)</td>
                          <td className="num text-right">{money(payload.es_99)}</td>
                        </tr>
                        <tr>
                          <td>Median worst drawdown along the path</td>
                          <td className="num text-right">{pct(payload.max_drawdown.median, 1)}</td>
                        </tr>
                        <tr>
                          <td>Worst drawdown in the 5% tail</td>
                          <td className="num text-right">{pct(payload.max_drawdown.p5, 1)}</td>
                        </tr>
                        <tr>
                          <td>Expected annual return used</td>
                          <td className="num text-right">{pct(payload.expected_return, 2)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </Card>
              </div>

              <Alert kind="warning" title="What this simulation assumes">
                Returns are drawn from a {payload.method === "bootstrap" ? "resampling of historical days" : payload.method === "student_t" ? "fat-tailed Student-t distribution" : "multivariate normal distribution"}{" "}
                with constant parameters, independent across days. Real markets have changing volatility, autocorrelation in
                stress, and correlations that move toward one in a crisis. Read the lower percentiles as optimistic, and compare
                them with the stress tests, which assume a specific severe event rather than a distribution.
              </Alert>
            </>
          ) : null}
        </div>
      </div>
    </>
  );
}
