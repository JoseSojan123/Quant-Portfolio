"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import useSWR from "swr";

import { Alert } from "@/components/ui";
import { fetcher } from "@/lib/api";
import { dateTime } from "@/lib/format";
import type { DataStatus } from "@/lib/types";

const SECTIONS = [
  { id: "data", label: "Prices and returns" },
  { id: "estimation", label: "Expected returns and covariance" },
  { id: "portfolio", label: "Portfolio risk and return" },
  { id: "contribution", label: "Risk contribution" },
  { id: "concentration", label: "Concentration" },
  { id: "drawdown", label: "Drawdown" },
  { id: "tail", label: "VaR and Expected Shortfall" },
  { id: "benchmark", label: "Beta, alpha and tracking error" },
  { id: "optimization", label: "Optimization" },
  { id: "frontier", label: "Efficient frontier" },
  { id: "simulation", label: "Monte Carlo" },
  { id: "stress", label: "Stress testing" },
  { id: "rebalancing", label: "Rebalancing and turnover" },
  { id: "backtest", label: "Walk-forward backtesting" },
  { id: "limits", label: "What this model cannot do" },
];

export default function MethodologyPage() {
  const { data: status } = useSWR<DataStatus>("/meta/data-status", fetcher);

  return (
    <div className="lg:grid lg:grid-cols-[1fr_220px] lg:gap-10">
      <div className="min-w-0">
        <p className="eyebrow text-brand-600">Methodology</p>
        <h1 className="mt-2 font-display text-[34px] font-semibold leading-[1.08] tracking-tightest text-ink sm:text-[48px]">Every number on this site, and how it is produced</h1>
        <p className="mt-4 max-w-2xl text-[17px] leading-relaxed text-ink-2 sm:text-[19px]">
          Nothing here is a black box. Each page in the app carries a “How is this calculated?” link; this page is the long
          version, with the formula, the inputs, the convention chosen where more than one exists, and the assumption that
          formula makes about the world.
        </p>

        {status?.synthetic ? (
          <div className="mt-5">
            <Alert kind="warning" title="This deployment runs on synthetic market data">
              Prices come from a documented, reproducible factor model rather than a market feed, because the hosting
              environment has no outbound access to a price provider. Every formula below is applied exactly as written; only
              the price series is simulated. Point <code className="rounded-md bg-black/[0.045] px-1.5 py-0.5">DATA_SOURCE=yahoo</code> at a real
              provider and the same pipeline runs on live adjusted closes.
            </Alert>
          </div>
        ) : null}

        <div className="mt-8 space-y-8">
          <Section id="data" title="Prices and returns">
            <P>
              The pipeline stores a daily price row per asset: open, high, low, close, adjusted close and volume. Everything
              downstream uses the <strong>adjusted close</strong>, which folds splits and dividends back into the price, so a
              dividend payment is not mistaken for a loss.
            </P>
            <Formula label="Simple daily return">r_t = P_t / P_(t−1) − 1</Formula>
            <Formula label="Log daily return">ℓ_t = ln(P_t / P_(t−1))</Formula>
            <P>
              Simple returns aggregate correctly across assets at a point in time (a portfolio return is the weighted sum of
              simple returns), so they are used for portfolio arithmetic. Log returns add up correctly over time, so they are
              used where a long compounding chain is involved. The two are close for small moves and diverge for large ones,
              which is why the distinction matters in a crash.
            </P>
            <Formula label="Annualization">μ_annual = μ_daily × 252  ·  σ_annual = σ_daily × √252</Formula>
            <P>
              252 is the standard count of US trading days in a year. The √252 on volatility follows from variance scaling
              linearly in time under the independence assumption — an assumption real markets violate during stress, when
              moves cluster.
            </P>
            <H>Data hygiene</H>
            <List
              items={[
                "Tickers are uppercased and duplicate rows for the same ticker and date are collapsed, keeping the last.",
                "Missing days are dropped, never forward-filled. A forward-filled price invents a zero-return day and quietly understates volatility.",
                "Non-positive prices are dropped as bad data.",
                "Assets are aligned on their common trading days before any covariance is computed, so every pair is measured over the same dates.",
                "A run of five or more identical closes is flagged as potentially stale rather than silently used.",
              ]}
            />
          </Section>

          <Section id="estimation" title="Expected returns and covariance">
            <P>
              Mean-variance analysis needs a vector of expected returns <Math>μ</Math> and a covariance matrix{" "}
              <Math>Σ</Math>. Both are estimated from a finite window of history, and the estimate is the single largest source
              of error in everything that follows. The app therefore offers three estimators for each and tells you which one
              produced the numbers on screen.
            </P>
            <H>Expected returns</H>
            <List
              items={[
                "Historical mean — the sample average daily return, annualized. Unbiased and very noisy: with three years of data the standard error on an annual mean return is several percentage points.",
                "Bayes-Stein shrinkage (Jorion) — pulls each asset's mean towards the global minimum-variance portfolio's mean. The shrinkage intensity is estimated from the data, so a short, noisy window shrinks more.",
                "CAPM equilibrium — rebuilds each expected return as the risk-free rate plus beta times the market risk premium, which replaces a noisy mean with a structural one.",
              ]}
            />
            <H>Covariance</H>
            <List
              items={[
                "Sample covariance — the plain estimator. Needs many more observations than assets to be well conditioned.",
                "Ledoit-Wolf shrinkage — blends the sample matrix with a scaled identity target using an analytically optimal intensity. The result is always invertible and usually produces more stable optimal weights.",
                "EWMA with λ = 0.94 — exponentially weighted, so recent days dominate. Reacts fastest to a change in regime and is the most volatile input.",
              ]}
            />
            <P>
              The correlation matrix shown on the risk page is derived from whichever covariance you picked:{" "}
              <Math>ρ_ij = Σ_ij / (σ_i σ_j)</Math>.
            </P>
          </Section>

          <Section id="portfolio" title="Portfolio risk and return">
            <P>Weights are value weights: each holding&apos;s market value divided by the total.</P>
            <Formula label="Portfolio expected return">E[R_p] = w′μ = Σ_i w_i μ_i</Formula>
            <Formula label="Portfolio variance">σ_p² = w′Σw = Σ_i Σ_j w_i w_j Σ_ij</Formula>
            <P>
              The cross terms are the whole point of diversification. Two assets with 20% volatility each and a correlation of
              0.3, held equally, give a portfolio volatility of about 16%, not 20%. Correlation, not the number of holdings, is
              what reduces risk.
            </P>
            <Formula label="Sharpe ratio">S = (E[R_p] − r_f) / σ_p</Formula>
            <Formula label="Sortino ratio">Sortino = (E[R_p] − r_f) / σ_downside, where σ_downside uses only returns below the target</Formula>
            <P>
              Sharpe penalizes upside and downside volatility equally; Sortino only penalizes the downside. A strategy with a
              long right tail scores better on Sortino, which is usually the fairer reading.
            </P>
          </Section>

          <Section id="contribution" title="Risk contribution">
            <P>
              A 10% weight is not 10% of the risk. Risk contribution splits total portfolio volatility into per-asset pieces
              that sum exactly to it.
            </P>
            <Formula label="Marginal contribution to risk">MCR_i = (Σw)_i / σ_p</Formula>
            <Formula label="Risk contribution">RC_i = w_i × MCR_i  ·  Σ_i RC_i = σ_p</Formula>
            <P>
              The percentage figures on the risk page are <Math>RC_i / σ_p</Math>. When one position&apos;s risk share runs far
              above its weight share, that asset is either more volatile than the rest or highly correlated with everything
              else you own. Risk parity is the allocation that equalizes these shares.
            </P>
          </Section>

          <Section id="concentration" title="Concentration">
            <Formula label="Herfindahl-Hirschman index">HHI = Σ_i w_i²</Formula>
            <Formula label="Effective number of positions">N_eff = 1 / HHI</Formula>
            <P>
              Twenty equally weighted positions give <Math>N_eff = 20</Math>. Twenty positions where one holds 60% give an
              effective number near 3, which is the honest description of that portfolio. The app reports HHI, the effective
              number, and the share of the largest one, three and five positions.
            </P>
          </Section>

          <Section id="drawdown" title="Drawdown">
            <Formula label="Drawdown at time t">DD_t = V_t / max(V_0…V_t) − 1</Formula>
            <P>
              Maximum drawdown is the most negative value of that series: the worst peak-to-trough fall an investor would have
              lived through. The app also reports the peak date, the trough date, the recovery date when one exists, the
              longest time spent below a previous peak, and the current drawdown. Duration usually hurts more than depth,
              because that is the period during which people abandon a plan.
            </P>
          </Section>

          <Section id="tail" title="Value at Risk and Expected Shortfall">
            <P>
              VaR answers “how bad is a bad day?” at a chosen confidence. Expected Shortfall answers “and if it is worse than
              that, how much worse on average?” — which is the more useful of the two, because VaR says nothing about the
              shape of the tail beyond its own threshold.
            </P>
            <Formula label="Historical VaR (95%)">VaR = −quantile(r_p, 0.05)</Formula>
            <Formula label="Historical Expected Shortfall (95%)">ES = −mean(r_p | r_p ≤ quantile(r_p, 0.05))</Formula>
            <Formula label="Parametric VaR">VaR = −(μ_daily + z_α σ_daily), z_0.05 ≈ −1.645</Formula>
            <P>
              Historical VaR makes no distributional assumption but can only show losses that already happened in the window.
              Parametric VaR assumes normality, which understates the real tail: equity returns are negatively skewed and
              fat-tailed, so a “five sigma” day arrives far more often than the normal distribution allows. Both are reported
              side by side so the gap is visible.
            </P>
            <Formula label="Scaling to a horizon">VaR_h = VaR_1 × √h</Formula>
            <P>Which again assumes independent days, and so understates risk in a trending sell-off.</P>
          </Section>

          <Section id="benchmark" title="Beta, alpha, tracking error and information ratio">
            <Formula label="Beta">β = Cov(r_p, r_m) / Var(r_m)</Formula>
            <Formula label="Alpha (annualized)">α = (μ_p − r_f) − β (μ_m − r_f)</Formula>
            <Formula label="Tracking error">TE = σ(r_p − r_m) × √252</Formula>
            <Formula label="Information ratio">IR = mean(r_p − r_m) × 252 / TE</Formula>
            <P>
              Beta is a regression slope against the benchmark, so it carries that regression&apos;s R². A low R² means the
              benchmark explains little of this portfolio&apos;s movement and beta should not be leaned on. Alpha estimated from
              a few years of data is almost never statistically distinguishable from zero; the app shows it because it is
              standard, not because a positive number proves skill.
            </P>
          </Section>

          <Section id="optimization" title="Optimization">
            <P>Each objective is solved numerically with sequential least-squares programming (SLSQP), using analytic gradients.</P>
            <Formula label="Minimum variance">minimize w′Σw</Formula>
            <Formula label="Maximum Sharpe">maximize (w′μ − r_f) / √(w′Σw)</Formula>
            <Formula label="Target return">minimize w′Σw subject to w′μ ≥ R*</Formula>
            <Formula label="Risk parity">equalize RC_i across assets (equal risk contribution)</Formula>
            <P>
              Risk parity is started from the solution of a convex reformulation and then polished, which is what makes it
              converge reliably instead of landing in a local corner.
            </P>
            <H>Constraints</H>
            <List
              items={[
                "Fully invested: Σ w_i = 1, always.",
                "Long only: w_i ≥ 0. Turn it off and short positions become feasible.",
                "Maximum weight per asset, to stop the optimizer concentrating into whichever asset had the luckiest window.",
                "Minimum holding if selected — a semi-continuous constraint, solved by dropping positions below the floor and re-solving, so you do not get a recommendation to buy 0.3% of something.",
                "Sector caps, applied to the sum of weights within each sector.",
                "Cash floor, held exactly at the floor so that risk-free cash does not absorb the whole portfolio in a minimum-variance solve.",
                "Turnover cap relative to your current weights, formulated exactly with auxiliary variables rather than approximated with a penalty.",
              ]}
            />
            <P>
              When a constraint set is impossible, the app says why in words rather than returning a solver code — for
              example, five assets with a 15% cap can hold at most 75% of the portfolio, so it cannot be fully invested. The
              feasible maximum return is found with a linear program before the quadratic solve, so a target-return request
              that cannot be met is reported with the number that can.
            </P>
          </Section>

          <Section id="frontier" title="Efficient frontier">
            <P>
              The frontier is traced by solving the minimum-variance problem for a grid of target returns between the
              minimum-variance portfolio&apos;s return and the highest feasible return, under the same constraints. Each point
              is therefore a real, investable portfolio under your rules, not an unconstrained textbook curve.
            </P>
            <Formula label="Tangency portfolio">the frontier point maximizing (w′μ − r_f) / √(w′Σw)</Formula>
            <Formula label="Capital market line">E[R] = r_f + σ × (E[R_tan] − r_f) / σ_tan</Formula>
            <P>
              The random feasible portfolios scattered under the curve exist to show how much of the space is ordinary. The
              curve itself moves when you change the estimation window, because <Math>μ</Math> moves. Treat its shape as the
              lesson and its exact position as provisional.
            </P>
          </Section>

          <Section id="simulation" title="Monte Carlo simulation">
            <P>
              Each simulation draws a sequence of daily portfolio returns and compounds them from today&apos;s value, holding
              weights fixed.
            </P>
            <Formula label="Path">V_T = V_0 × Π_(t=1..T) (1 + r_t)</Formula>
            <List
              items={[
                "Multivariate normal — draws correlated asset returns from μ and Σ. Symmetric and thin-tailed, so it understates crash risk.",
                "Student-t with 5 degrees of freedom — rescaled to the same covariance, so the volatility matches but the tails are fatter and extreme days are far more frequent.",
                "Historical bootstrap — resamples whole historical days with replacement, which preserves the real skew, kurtosis and cross-sectional correlation of days that actually happened.",
              ]}
            />
            <P>
              The fan chart shows percentiles of value on each day across all simulations, not individual paths, so no single
              simulation traces the median line. Simulated VaR and Expected Shortfall are read off the distribution of terminal
              values; drawdown statistics are computed inside each path and then summarized across paths. Runs are seeded, so
              the same settings reproduce the same figures.
            </P>
          </Section>

          <Section id="stress" title="Stress testing">
            <P>
              A stress test is not a probability statement. It applies one chosen adverse assumption to your current weights
              and reports the resulting profit and loss and which holdings drove it.
            </P>
            <List
              items={[
                "Market shock — the market moves by a stated amount and each holding moves by its beta times that amount, so a high-beta position loses more than the index.",
                "Sector, tag and single-ticker shocks — a rule-based move applied to whatever matches.",
                "Historical replay — the actual cumulative asset moves over a real window, such as February–March 2020 or the 2022 bear market, applied to today's weights.",
                "Custom shocks — your own number on your own holdings.",
              ]}
            />
            <P>
              Each scenario reports value before, value after, profit and loss, and a per-holding breakdown with each
              position&apos;s share of the total loss.
            </P>
          </Section>

          <Section id="rebalancing" title="Rebalancing and turnover">
            <Formula label="Drift">drift_i = w_i,current − w_i,target</Formula>
            <Formula label="Turnover">T = Σ_i |w_i,target − w_i,current|</Formula>
            <Formula label="Estimated cost">cost = c × T × portfolio value</Formula>
            <P>
              Turnover is quoted on this two-sided convention, so selling 10% of one asset to buy another is 20% turnover;
              one-way turnover, which brokers usually quote, is half of it. A rebalance is only recommended when the largest
              drift exceeds your threshold, because trading has a cost and a small drift is not worth paying it. Share counts
              are the trade value divided by the latest price, optionally rounded to whole shares. Taxes on realized gains are
              not modelled.
            </P>
          </Section>

          <Section id="backtest" title="Walk-forward backtesting">
            <P>
              At each rebalance date the optimizer sees a window of history that <strong>ends strictly before that date</strong>,
              chooses weights, pays transaction costs on the turnover, and then holds those weights while they drift with prices
              until the next rebalance date.
            </P>
            <List
              items={[
                "No look-ahead: the estimation window never includes the rebalance day itself, and the app asserts that condition and displays the result.",
                "Weights drift between rebalances exactly as a real portfolio does; they are not silently reset each day.",
                "Transaction costs are charged on turnover at every rebalance, including the initial purchase.",
                "Every strategy is scored over the same evaluation window, so the comparison is fair.",
                "The benchmark is a buy-and-hold position in the index, charged the same entry cost.",
              ]}
            />
            <P>
              Reported metrics are total return, CAGR, annualized volatility, Sharpe, maximum drawdown, Calmar (CAGR divided by
              the absolute worst drawdown), average turnover and total costs. One historical path is one sample: the ranking
              between strategies can flip with a different window, frequency or period, and strategies that depend most on
              estimated expected returns tend to look better in a backtest than they behave afterwards.
            </P>
          </Section>

          <Section id="limits" title="What this model cannot do">
            <List
              items={[
                "It cannot predict returns. Expected returns are estimates from past data and are the weakest input in the whole chain.",
                "It assumes the covariance structure persists. In a crisis, correlations move towards one and diversification delivers less than the matrix promised.",
                "It treats volatility as the definition of risk. Permanent loss of capital, illiquidity and leverage are risks volatility does not capture.",
                "It ignores taxes, bid-ask spreads beyond the flat cost rate, market impact, dividend timing and currency effects.",
                "It assumes you can trade at the last close. In practice you trade at tomorrow's open or worse.",
                "It is an analysis tool and educational project, not investment advice, and it never connects to a brokerage account.",
              ]}
            />
            <P>
              The data status for this deployment: {status ? `${status.source} prices covering ${status.first_date} to ${status.last_date}, ${status.assets} assets, last refreshed ${status.last_updated ? dateTime(status.last_updated) : "unknown"}.` : "loading…"}
            </P>
            <P>
              More on the architecture and its known limitations on the{" "}
              <Link href="/about" className="font-medium text-brand-700 underline decoration-brand-200 underline-offset-2 hover:decoration-brand-600">
                about page
              </Link>
              .
            </P>
          </Section>
        </div>
      </div>

      <nav aria-label="On this page" className="mt-10 hidden lg:mt-0 lg:block">
        <div className="sticky top-20">
          <p className="label mb-2">On this page</p>
          <ul className="space-y-1 border-l border-hair">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="-ml-px block border-l-2 border-transparent py-1 pl-3 text-[13px] text-ink-2 transition hover:border-brand-600 hover:text-ink">
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </nav>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-hair pt-10 first:border-0 first:pt-0">
      <h2 className="font-display text-[24px] font-semibold tracking-tightest text-ink sm:text-[28px]">{title}</h2>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

function P({ children }: { children: ReactNode }) {
  return <p className="max-w-2xl text-[15px] leading-[1.65] text-ink-2 sm:text-[16px]">{children}</p>;
}

function H({ children }: { children: ReactNode }) {
  return <h3 className="pt-2 font-display text-[17px] font-semibold tracking-tighter2 text-ink">{children}</h3>;
}

function Math({ children }: { children: ReactNode }) {
  return <span className="num rounded-md bg-black/[0.045] px-1.5 py-0.5 text-[0.9em] text-ink">{children}</span>;
}

function Formula({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="max-w-2xl rounded-2xl bg-page px-5 py-4 ring-1 ring-inset ring-black/[0.03]">
      <p className="text-[12px] font-medium text-ink-3">{label}</p>
      <p className="mt-1.5 break-words font-mono text-[14px] leading-relaxed tracking-normal text-ink sm:text-[15px]">{children}</p>
    </div>
  );
}

function List({ items }: { items: string[] }) {
  return (
    <ul className="max-w-2xl space-y-2">
      {items.map((t) => (
        <li key={t} className="flex gap-2.5 text-[15px] leading-relaxed text-ink-2">
          <span aria-hidden className="mt-[0.45rem] h-1.5 w-1.5 shrink-0 rounded-full bg-brand-300" />
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}
