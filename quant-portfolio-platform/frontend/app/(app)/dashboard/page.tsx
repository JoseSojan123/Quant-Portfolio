"use client";

import { AlertTriangle, ArrowRight, Info, Lightbulb } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";

import { AllocationDonut } from "@/components/charts/allocation";
import { GroupedBars } from "@/components/charts/bars";
import { DrawdownChart, TimeSeries } from "@/components/charts/lines";
import { BENCH, SERIES } from "@/components/charts/base";
import { InputsNote, PageHeader } from "@/components/layout/page-header";
import { NoPortfolio } from "@/components/portfolio/pickers";
import { Alert, Badge, Card, CardHead, LinkButton, MoneyDelta, SegmentedControl, Skeleton, Stat, StatRow } from "@/components/ui";
import { errorMessage } from "@/lib/api";
import { money, num, pct, tone } from "@/lib/format";
import { usePortfolios } from "@/lib/portfolio-context";
import type { Overview } from "@/lib/types";

const WINDOWS = [
  { value: "252", label: "1Y" },
  { value: "504", label: "2Y" },
  { value: "756", label: "3Y" },
  { value: "1260", label: "5Y" },
];

export default function DashboardPage() {
  const { activeId, active, loading } = usePortfolios();
  const [lookback, setLookback] = useState("756");
  const { data, error, isLoading } = useSWR<Overview>(activeId ? `/portfolios/${activeId}/overview?lookback_days=${lookback}` : null);

  if (loading) return <Skeleton className="h-64" />;
  if (!activeId) return <NoPortfolio />;

  return (
    <>
      <PageHeader title={active?.name ?? "Dashboard"} subtitle="What you own, what it is worth, how it has performed and how risky it is.">
        <SegmentedControl value={lookback} onChange={setLookback} options={WINDOWS} ariaLabel="Estimation window" />
        <LinkButton href="/optimize" size="sm">
          Optimize my portfolio
        </LinkButton>
      </PageHeader>

      {error ? <Alert kind="error">{errorMessage(error)}</Alert> : null}
      {isLoading && !data ? <DashboardSkeleton /> : null}

      {data ? <DashboardBody data={data} /> : null}
    </>
  );
}

function DashboardBody({ data }: { data: Overview }) {
  const v = data.valuation;
  const risk = data.risk;
  const perf = data.performance;

  if (!v.holdings.length)
    return (
      <Card>
        <CardHead title="No holdings yet" />
        <div className="card-pad">
          <p className="text-sm text-ink-2">Add the positions you own and the full analytics suite becomes available.</p>
          <LinkButton href="/portfolio" size="sm" className="mt-3">
            Add holdings
          </LinkButton>
        </div>
      </Card>
    );

  const rcRows = (risk?.risk_contribution ?? [])
    .slice()
    .sort((a, b) => b.risk_pct - a.risk_pct)
    .slice(0, 8)
    .map((r) => ({ ticker: r.ticker, weight: r.weight, risk_pct: r.risk_pct }));

  return (
    <div className="space-y-5 lg:space-y-6">
      {/* Headline value */}
      <Card className="card-pad">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <p className="label">Portfolio value</p>
            <p className="num mt-1 font-display text-[44px] font-semibold leading-none tracking-tightest text-ink sm:text-[56px]">{money(v.current_value)}</p>
            <p className="mt-3 text-[15px]">
              <MoneyDelta value={v.day_change} percent={v.day_change_pct} />
              <span className="text-ink-3"> today</span>
            </p>
            <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-hair pt-5 sm:grid-cols-3">
              <div>
                <dt className="label">Invested</dt>
                <dd className="num mt-1 font-display text-[19px] font-semibold tracking-tighter2 text-ink">{money(v.invested_value)}</dd>
              </div>
              <div>
                <dt className="label">Unrealized P&amp;L</dt>
                <dd className={`num mt-1 font-display text-[19px] font-semibold tracking-tighter2 ${tone(v.unrealized_pnl)}`}>{money(v.unrealized_pnl, { signed: true })}</dd>
              </div>
              <div>
                <dt className="label">Total return</dt>
                <dd className={`num mt-1 font-display text-[19px] font-semibold tracking-tighter2 ${tone(v.total_return)}`}>{pct(v.total_return, 1, true)}</dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-ink-3">Priced with closes from {v.price_date}.</p>
          </div>
          <div>
            <AllocationDonut
              data={v.holdings.map((h) => ({ name: h.ticker, weight: h.weight, value: h.current_value }))}
              centerLabel="Holdings"
              centerValue={String(v.holdings.length)}
              height={220}
            />
          </div>
        </div>
      </Card>

      {/* Risk KPIs */}
      {risk ? (
        <Card className="card-pad">
          <StatRow cols={6}>
            <Stat
              label="Volatility"
              value={pct(risk.metrics.volatility)}
              hint="annualized"
              help={<>Annualized standard deviation of portfolio returns, computed as sqrt(w&apos;&Sigma;w) from the covariance matrix over the selected window. Covariance matters: it is not the weighted average of each asset&apos;s volatility.</>}
            />
            <Stat
              label="Sharpe ratio"
              value={num(risk.metrics.sharpe)}
              hint={`vs ${pct(risk.inputs.risk_free_rate, 1)} risk-free`}
              help={<>(Expected return &minus; risk-free rate) / volatility, both annualized. A high historical Sharpe does not guarantee future performance, and it treats volatility as the only risk.</>}
            />
            <Stat
              label="Max drawdown"
              value={pct(risk.drawdown.max_drawdown)}
              hint={risk.drawdown.trough_date ? `trough ${risk.drawdown.trough_date}` : undefined}
              help={<>Largest peak-to-trough fall of the portfolio value path: min(V&#8339; / running peak &minus; 1). It answers a different question from volatility.</>}
            />
            <Stat
              label="95% VaR (1 day)"
              value={pct(risk.metrics.var_hist)}
              hint={money(risk.money.var_hist, { compact: true }) + " loss"}
              deltaIsGood={false}
              help={<>Historical VaR: the 5th percentile of the portfolio&apos;s daily returns over the window, shown as a positive loss. Losses worse than this happened on about 5% of days in the sample.</>}
            />
            <Stat
              label="Expected Shortfall"
              value={pct(risk.metrics.es_hist)}
              hint={money(risk.money.es_hist, { compact: true }) + " average"}
              help={<>Average loss on the days that were worse than the 95% VaR threshold. VaR gives a threshold; ES tells you how bad the tail is beyond it.</>}
            />
            <Stat
              label="Market beta"
              value={num(risk.metrics.beta)}
              hint="vs SPY"
              help={<>Slope of a regression of portfolio daily returns on SPY daily returns. Beta 1.0 means the portfolio has moved roughly one-for-one with the market.</>}
            />
          </StatRow>
          <InputsNote inputs={risk.inputs} className="mt-4 border-t border-hair pt-3" />
        </Card>
      ) : null}

      {/* Insights */}
      {data.insights.length ? (
        <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${data.insights.length >= 4 ? "xl:grid-cols-4" : "lg:grid-cols-3"}`}>
          {data.insights.map((i) => {
            const Icon = i.level === "warning" ? AlertTriangle : i.level === "action" ? Lightbulb : Info;
            const tint =
              i.level === "warning"
                ? "from-[#ffb340] to-[#f58a00]"
                : i.level === "action"
                  ? "from-[#2b8bf2] to-[#0071e3]"
                  : "from-[#9b9aa2] to-[#76767e]";
            return (
              <Link key={i.title} href={i.href} className="card card-pad group flex flex-col transition duration-300 hover:-translate-y-0.5 hover:shadow-lift">
                <span className={`inline-flex h-8 w-8 items-center justify-center rounded-[10px] bg-gradient-to-br ${tint} text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.3)]`}>
                  <Icon className="h-4 w-4" strokeWidth={2.2} />
                </span>
                <p className="mt-3.5 font-display text-[15px] font-semibold tracking-tighter2 text-ink">{i.title}</p>
                <p className="mt-1 flex-1 text-[13px] leading-relaxed text-ink-2">{i.body}</p>
                <p className="mt-3 inline-flex items-center gap-1 text-[13px] font-medium text-brand-600">
                  Open <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
                </p>
              </Link>
            );
          })}
        </div>
      ) : null}

      {/* Performance */}
      {perf ? (
        <Card>
          <CardHead
            title="Performance of current holdings"
            subtitle="Hypothetical: it values today's quantities back through the window, so it ignores past buys and sells."
            right={
              <div className="num flex gap-4 text-xs">
                <span>
                  <span className="text-ink-3">Window </span>
                  <span className={`font-medium ${tone(perf.period_return)}`}>{pct(perf.period_return, 1, true)}</span>
                </span>
                {perf.benchmark_return !== null ? (
                  <span>
                    <span className="text-ink-3">SPY </span>
                    <span className="font-medium text-ink">{pct(perf.benchmark_return, 1, true)}</span>
                  </span>
                ) : null}
              </div>
            }
            help={<>Each day&apos;s value is the sum of quantity &times; that day&apos;s close for every current holding. The benchmark line is SPY scaled to the same starting value, so the comparison is about shape, not about an actual benchmark investment.</>}
          />
          <div className="card-pad">
            <TimeSeries
              data={perf.series}
              series={[
                { key: "value", label: "Portfolio", color: SERIES[0] },
                { key: "benchmark", label: "SPY (scaled)", color: BENCH, dashed: true },
              ]}
              area
              height={300}
            />
          </div>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Capital vs risk */}
        {risk ? (
          <Card>
            <CardHead
              title="Capital weight vs risk contribution"
              subtitle="A 10% holding can account for far more than 10% of risk."
              help={<>Risk contribution RC&#7522; = w&#7522; &times; (&Sigma;w)&#7522; / &sigma;&#7526;, which sums to total portfolio volatility. Shown here as a share of the total.</>}
            />
            <div className="card-pad">
              <GroupedBars
                data={rcRows}
                categoryKey="ticker"
                series={[
                  { key: "weight", label: "Capital weight", color: SERIES[0] },
                  { key: "risk_pct", label: "Risk contribution", color: SERIES[1] },
                ]}
              />
            </div>
          </Card>
        ) : null}

        {/* Drawdown + sector */}
        <div className="space-y-5">
          {perf ? (
            <Card>
              <CardHead
                title="Drawdown"
                subtitle={
                  risk
                    ? `Deepest fall ${pct(risk.drawdown.max_drawdown)} · currently ${pct(risk.drawdown.current_drawdown)} below peak`
                    : undefined
                }
              />
              <div className="card-pad">
                <DrawdownChart data={perf.drawdown_series} height={180} />
              </div>
            </Card>
          ) : null}

          {risk ? (
            <Card>
              <CardHead
                title="Diversification"
                right={
                  <Badge kind={risk.concentration.effective_n < 3 ? "warn" : "neutral"}>
                    {num(risk.concentration.effective_n, 1)} effective holdings
                  </Badge>
                }
                help={<>Effective number of holdings is 1 / Herfindahl index (sum of squared weights). Five equal positions give 5.0; one dominant position pushes it toward 1.</>}
              />
              <div className="card-pad space-y-3">
                <div>
                  <p className="label mb-1.5">Sector exposure</p>
                  <ul className="space-y-1.5">
                    {Object.entries(risk.sector_exposure).map(([s, w], i) => (
                      <li key={s} className="flex items-center gap-2 text-xs">
                        <span className="w-32 shrink-0 truncate text-ink-2">{s}</span>
                        <span className="h-2 flex-1 overflow-hidden rounded-full bg-black/[0.05]">
                          <span className="block h-full rounded-full" style={{ width: `${Math.max(w * 100, 1)}%`, background: SERIES[i % SERIES.length] }} />
                        </span>
                        <span className="num w-12 shrink-0 text-right font-medium text-ink">{pct(w, 0)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <dl className="grid grid-cols-3 gap-3 border-t border-hair pt-3 text-xs">
                  <div>
                    <dt className="text-ink-3">Largest holding</dt>
                    <dd className="num font-medium text-ink">{pct(risk.concentration.top1, 0)}</dd>
                  </div>
                  <div>
                    <dt className="text-ink-3">Top 3</dt>
                    <dd className="num font-medium text-ink">{pct(risk.concentration.top3, 0)}</dd>
                  </div>
                  <div>
                    <dt className="text-ink-3">Avg correlation</dt>
                    <dd className="num font-medium text-ink">{num(risk.correlation.average_pairwise)}</dd>
                  </div>
                </dl>
              </div>
            </Card>
          ) : null}
        </div>
      </div>

      {/* Holdings table */}
      <Card>
        <CardHead
          title="Holdings"
          subtitle={`${v.holdings.length} positions`}
          right={
            <LinkButton href="/portfolio" variant="secondary" size="sm">
              Manage holdings
            </LinkButton>
          }
        />
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th scope="col">Ticker</th>
                <th scope="col" className="hidden sm:table-cell">Sector</th>
                <th scope="col" className="text-right">Qty</th>
                <th scope="col" className="text-right">Avg cost</th>
                <th scope="col" className="text-right">Price</th>
                <th scope="col" className="text-right">Value</th>
                <th scope="col" className="text-right">Weight</th>
                <th scope="col" className="text-right">P&amp;L</th>
              </tr>
            </thead>
            <tbody>
              {v.holdings.map((h) => (
                <tr key={h.id}>
                  <td>
                    <span className="font-medium">{h.ticker}</span>
                    <span className="block text-xs text-ink-3">{h.name}</span>
                  </td>
                  <td className="hidden text-ink-2 sm:table-cell">{h.sector}</td>
                  <td className="num text-right">{num(h.quantity, 2)}</td>
                  <td className="num text-right">{money(h.average_cost, { cents: true })}</td>
                  <td className="num text-right">{money(h.current_price, { cents: true })}</td>
                  <td className="num text-right font-medium">{money(h.current_value)}</td>
                  <td className="num text-right">{pct(h.weight, 1)}</td>
                  <td className={`num text-right font-medium ${tone(h.unrealized_pnl)}`}>
                    {money(h.unrealized_pnl, { signed: true })}
                    <span className="block text-xs font-normal">{pct(h.unrealized_pnl_pct, 1, true)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-56" />
      <Skeleton className="h-24" />
      <Skeleton className="h-80" />
    </div>
  );
}
