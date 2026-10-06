"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";

import { SERIES } from "@/components/charts/base";
import { FrontierChart } from "@/components/charts/scatter";
import { InputsNote, PageHeader } from "@/components/layout/page-header";
import { NoPortfolio } from "@/components/portfolio/pickers";
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
import { Alert, Button, Card, CardHead, Field, Select, Skeleton, Stat, StatRow } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { num, pct } from "@/lib/format";
import { usePortfolios } from "@/lib/portfolio-context";
import type { Asset, FrontierResult, PortfolioDetail, Preferences } from "@/lib/types";

export default function FrontierPage() {
  const { activeId, loading } = usePortfolios();
  const { data: prefs } = useSWR<Preferences>("/me/preferences");
  const { data: assets } = useSWR<Asset[]>("/assets");
  const { data: detail } = useSWR<PortfolioDetail>(activeId ? `/portfolios/${activeId}` : null);

  const [objective, setObjective] = useState("max_sharpe");
  const [constraints, setConstraints] = useState<ConstraintState>({ ...DEFAULT_CONSTRAINTS, max_single_asset: 0.4 });
  const [est, setEst] = useState<EstimationState | null>(null);
  const [data, setData] = useState<FrontierResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const estimation: EstimationState = est ?? {
    lookback_days: prefs?.lookback_days ?? 756,
    return_method: prefs?.return_method ?? "historical",
    cov_method: prefs?.cov_method ?? "sample",
    risk_free_rate: prefs?.risk_free_rate ?? 0.04,
  };

  const held = useMemo(() => detail?.valuation.holdings.map((h) => h.ticker) ?? [], [detail]);
  const sectors = useMemo(() => Array.from(new Set((assets ?? []).filter((a) => held.includes(a.ticker)).map((a) => a.sector))).sort(), [assets, held]);

  const key = activeId ? `frontier|${activeId}|${objective}|${JSON.stringify(constraints)}|${JSON.stringify(estimation)}` : null;
  const { data: auto, error: autoError, isLoading } = useSWR<FrontierResult>(
    key,
    () =>
      api<FrontierResult>("/portfolio/frontier", {
        body: { portfolio_id: activeId, objective, ...estimation, ...constraintPayload(constraints, objective) },
      }),
    { keepPreviousData: true },
  );
  const payload = data ?? auto;

  async function rerun() {
    setBusy(true);
    setError(null);
    try {
      setData(
        await api<FrontierResult>("/portfolio/frontier", {
          body: { portfolio_id: activeId, objective, ...estimation, ...constraintPayload(constraints, objective) },
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
        title="Efficient frontier"
        subtitle="For each level of risk, the highest expected return your constraints allow — and where your portfolio sits relative to it."
        help={
          <>
            Each frontier point minimizes w&apos;&Sigma;w subject to a fixed expected return and your constraints. A portfolio
            below the curve is inefficient <em>under this model</em>: a feasible portfolio offers more expected return for the same
            risk. The curve depends entirely on the estimates, so it moves when the window or estimator changes.
          </>
        }
      />

      {error || autoError ? <Alert kind="error">{errorMessage(error ?? autoError)}</Alert> : null}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card>
            <CardHead title="Highlighted portfolio" />
            <div className="card-pad">
              <Field label="Objective to mark on the chart" htmlFor="obj">
                <Select id="obj" value={objective} onChange={setObjective} options={OBJECTIVES.filter((o) => o.value !== "equal_weight")} />
              </Field>
            </div>
            <Disclosure title="Constraints" defaultOpen>
              <ConstraintControls value={constraints} onChange={setConstraints} sectors={sectors} objective={objective} nAssets={held.length} />
            </Disclosure>
            <Disclosure title="Estimation settings">
              <EstimationControls value={estimation} onChange={setEst} />
            </Disclosure>
            <div className="card-pad border-t border-hair">
              <Button onClick={rerun} loading={busy} className="w-full">
                Recompute frontier
              </Button>
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          {isLoading && !payload ? <Skeleton className="h-[460px]" /> : null}
          {payload ? (
            <>
              <Card>
                <CardHead
                  title="Risk vs expected return"
                  subtitle={`${payload.frontier.length} frontier points · ${payload.random_portfolios.length} random feasible portfolios · max weight ${pct(Number(payload.constraints.max_single_asset), 0)}`}
                />
                <div className="card-pad">
                  <FrontierChart
                    frontier={payload.frontier}
                    random={payload.random_portfolios}
                    assets={payload.assets}
                    cml={payload.cml}
                    markers={[
                      { label: payload.current.label, point: payload.current, color: SERIES[1] },
                      { label: payload.selected_label ?? "Selected", point: payload.selected, color: SERIES[2] },
                    ]}
                    height={420}
                  />
                  <InputsNote inputs={payload.inputs} className="mt-3" />
                </div>
              </Card>

              <StatRow cols={4}>
                <Card className="card-pad">
                  <Stat
                    label={`${payload.current.label} portfolio`}
                    value={num(payload.current.sharpe)}
                    hint={`Sharpe · vol ${pct(payload.current.volatility, 1)} · return ${pct(payload.current.expected_return, 1)}`}
                  />
                </Card>
                <Card className="card-pad">
                  <Stat
                    label="Minimum variance"
                    value={num(payload.min_variance.sharpe)}
                    hint={`Sharpe · vol ${pct(payload.min_variance.volatility, 1)} · return ${pct(payload.min_variance.expected_return, 1)}`}
                  />
                </Card>
                <Card className="card-pad">
                  <Stat
                    label="Tangency (max Sharpe)"
                    value={num(payload.tangency.sharpe)}
                    hint={`Sharpe · vol ${pct(payload.tangency.volatility, 1)} · return ${pct(payload.tangency.expected_return, 1)}`}
                    help={<>The portfolio touching the steepest line drawn from the risk-free rate. Combining it with cash traces the capital market line.</>}
                  />
                </Card>
                <Card className="card-pad">
                  <Stat label="Risk-free rate" value={pct(payload.risk_free_rate, 2)} hint="used for the capital market line" />
                </Card>
              </StatRow>

              <Card>
                <CardHead title="Frontier portfolios" subtitle="Every tenth point, with its allocation." />
                <div className="overflow-x-auto">
                  <table className="table-base">
                    <thead>
                      <tr>
                        <th scope="col">Volatility</th>
                        <th scope="col" className="text-right">Expected return</th>
                        <th scope="col" className="text-right">Sharpe</th>
                        <th scope="col">Largest positions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payload.frontier
                        .filter((_, i) => i % Math.max(1, Math.floor(payload.frontier.length / 8)) === 0)
                        .map((p) => (
                          <tr key={`${p.volatility}-${p.expected_return}`}>
                            <td className="num font-medium">{pct(p.volatility, 1)}</td>
                            <td className="num text-right">{pct(p.expected_return, 1)}</td>
                            <td className="num text-right">{num(p.sharpe)}</td>
                            <td className="text-xs text-ink-2">
                              {Object.entries(p.weights ?? {})
                                .sort((a, b) => b[1] - a[1])
                                .slice(0, 4)
                                .map(([t, w]) => `${t} ${pct(w, 0)}`)
                                .join(" · ")}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              <Alert kind="info" title="Reading this chart honestly">
                The frontier is drawn from estimated expected returns and covariances over one historical window. Expected returns
                in particular are unstable, so the curve shifts when you change the window or the estimator. Treat the shape as a
                guide to the risk/return trade-off, not as a precise prediction.
              </Alert>
            </>
          ) : null}
        </div>
      </div>
    </>
  );
}
