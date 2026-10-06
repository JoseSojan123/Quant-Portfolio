# Methodology

Every formula the platform uses, the convention it follows where more than one
exists, and the assumption it makes about the world.

The app ships this same material as a page at `/methodology`, and every
important number in the UI carries a "How is this calculated?" popover pointing
at the relevant part of it. This file is the version for someone reading the
repository, with the implementation named for each piece.

---

## 1. Prices and returns

`quant/features/returns.py`

The pipeline stores open, high, low, close, **adjusted close** and volume per
asset per day. Everything downstream uses the adjusted close, which folds splits
and dividends back into the price so a dividend is not read as a loss.

```
simple:   r_t = P_t / P_{t-1} − 1
log:      ℓ_t = ln(P_t / P_{t-1})
```

Simple returns aggregate correctly **across assets** at a point in time — a
portfolio return is the weighted sum of simple returns — so they are used for
all portfolio arithmetic. Log returns aggregate correctly **over time**, so they
are used where a long compounding chain is involved. The two agree for small
moves and diverge for large ones, which is exactly when the distinction matters.

```
annualized mean:        μ_a = μ_d × 252
annualized volatility:  σ_a = σ_d × √252
CAGR:                   (V_T / V_0)^(252/T) − 1
```

252 is the conventional count of US trading days. The √252 follows from variance
scaling linearly in time, which assumes independent days — an assumption markets
violate in stress, when moves cluster. Volatility estimated this way is
therefore an understatement precisely when it matters.

**Data hygiene** (`quant/data/validation.py`): tickers uppercased, duplicate
(ticker, date) rows collapsed keeping the last, **missing days dropped rather
than forward-filled** (a filled price invents a zero-return day and drags
measured volatility down), non-positive prices dropped, assets aligned on their
common trading days before any covariance is computed, and runs of five or more
identical closes flagged as possibly stale.

## 2. Expected returns and covariance

`quant/optimization/estimators.py`

Mean-variance analysis needs μ and Σ. Both are estimated from a finite window,
and that estimate is the largest source of error in everything downstream — so
the app offers three estimators for each and always reports which produced the
numbers on screen.

**Expected returns**

| Method | What it does | Why you would use it |
|---|---|---|
| `historical` | Sample mean, annualized | Unbiased, and very noisy: the standard error on an annual mean is several percentage points even with three years of data |
| `bayes_stein` | Jorion shrinkage towards the global minimum-variance portfolio's mean, with the intensity estimated from the data | Reduces the error that mean-variance optimization amplifies most |
| `capm` | r_f + β(E[R_m] − r_f) | Replaces a noisy sample mean with a structural one |

**Covariance**

| Method | What it does | Why you would use it |
|---|---|---|
| `sample` | The plain estimator | Fine when observations greatly outnumber assets |
| `ledoit_wolf` | Shrinks the sample matrix towards a scaled identity with an analytically optimal intensity | Always invertible; usually more stable optimal weights |
| `ewma` | Exponential weights, λ = 0.94 | Reacts fastest to a regime change, and is the noisiest |

Correlation is derived from whichever covariance was chosen:
`ρ_ij = Σ_ij / (σ_i σ_j)`.

## 3. Portfolio risk and return

`quant/risk/metrics.py`

Weights are value weights: a holding's market value over the total.

```
E[R_p] = w′μ
σ_p²   = w′Σw = Σ_i Σ_j w_i w_j Σ_ij
```

The cross terms are diversification. Two assets at 20% volatility with
correlation 0.3, held equally, give about 16% portfolio volatility — correlation
does the work, not the count of holdings.

```
Sharpe  = (E[R_p] − r_f) / σ_p
Sortino = (E[R_p] − r_f) / σ_downside
```

where σ_downside uses only returns below the target. Sharpe penalizes upside
volatility as if it were risk; Sortino does not, which is usually the fairer
reading of an asymmetric strategy.

## 4. Risk contribution

A 10% weight is not 10% of the risk. The decomposition is exact:

```
MCR_i = (Σw)_i / σ_p          marginal contribution to risk
RC_i  = w_i × MCR_i           and Σ_i RC_i = σ_p exactly
```

Reported as `RC_i / σ_p`. When a position's risk share runs well above its
weight share, it is either more volatile than the rest or more correlated with
everything else held. Risk parity is the allocation that equalizes these shares.

The identity `Σ RC_i = σ_p` is asserted in the test suite, because it is the
check that catches an error anywhere in the covariance path.

## 5. Concentration

```
HHI   = Σ_i w_i²
N_eff = 1 / HHI
```

Twenty equal positions give N_eff = 20. Twenty positions where one is 60% give
N_eff near 3, which is the honest description. The app also reports the share of
the top one, three and five positions.

## 6. Drawdown

```
DD_t = V_t / max(V_0 … V_t) − 1
max drawdown = min_t DD_t
```

Reported with the peak date, trough date, recovery date where one exists, the
longest stretch below a previous peak, and the current drawdown. Duration
usually hurts an investor more than depth, because duration is when people
abandon the plan.

## 7. Value at Risk and Expected Shortfall

VaR answers "how bad is a bad day?" at a confidence level. Expected Shortfall
answers "and when it is worse than that, how much worse on average?" — the more
useful of the two, because VaR says nothing about the tail beyond its own
threshold.

```
historical VaR(95%) = −quantile(r_p, 0.05)
historical ES(95%)  = −mean(r_p | r_p ≤ quantile(r_p, 0.05))
parametric VaR      = −(μ_d + z_α σ_d),  z_{0.05} ≈ −1.645
horizon scaling     = VaR_1 × √h
```

Historical VaR assumes nothing about the distribution but can only show losses
the window contains. Parametric VaR assumes normality, which understates the
real tail: equity returns are negatively skewed and fat-tailed, so a "five
sigma" day arrives far more often than the normal distribution allows. Both are
shown side by side so the gap is visible rather than hidden behind a choice.
The √h scaling again assumes independent days, so it understates risk in a
trending sell-off.

## 8. Benchmark-relative measures

`quant/factors/market.py`

```
β  = Cov(r_p, r_m) / Var(r_m)
α  = (μ_p − r_f) − β(μ_m − r_f)        annualized
TE = σ(r_p − r_m) × √252
IR = mean(r_p − r_m) × 252 / TE
```

Beta is a regression slope and carries that regression's R². A low R² means the
benchmark explains little of this portfolio's movement, and beta should not be
leaned on. Alpha estimated over a few years is almost never statistically
distinguishable from zero; the app reports it because it is standard, not
because a positive number demonstrates skill.

## 9. Optimization

`quant/optimization/optimizer.py` — SciPy SLSQP with analytic gradients.

| Objective | Problem |
|---|---|
| `min_variance` | minimize w′Σw |
| `max_sharpe` | maximize (w′μ − r_f) / √(w′Σw) |
| `target_return` | minimize w′Σw subject to w′μ ≥ R* |
| `risk_parity` | equalize RC_i across assets |
| `equal_weight` | the baseline, for comparison |

Risk parity starts from the solution of a convex reformulation and is then
polished, which is what makes it converge reliably rather than landing in a
local corner.

**Constraints**

| Constraint | Form |
|---|---|
| Fully invested | Σ w_i = 1, always |
| Long only | w_i ≥ 0 (optional) |
| Maximum weight | w_i ≤ w_max |
| Minimum holding | w_i = 0 or w_i ≥ w_min — semi-continuous, solved by dropping sub-floor positions and re-solving |
| Sector caps | Σ_{i∈s} w_i ≤ cap_s |
| Cash floor | cash pinned exactly at the floor, so risk-free cash does not absorb a minimum-variance solve |
| Turnover cap | Σ_i \|w_i − w_i^0\| ≤ T, formulated exactly with auxiliary variables rather than approximated with a penalty |

Feasibility is checked before the solve, and an impossible set is explained in
words: five assets with a 15% cap can hold at most 75%, so it cannot be fully
invested. The maximum feasible return is found with a linear program, so a
target-return request that cannot be met is answered with the number that can.

## 10. Efficient frontier

Traced by solving the minimum-variance problem for a grid of target returns
between the minimum-variance portfolio's return and the maximum feasible
return, under the same constraints. Every point is therefore a real investable
portfolio under your rules, not an unconstrained textbook curve.

```
tangency portfolio  = the frontier point maximizing (w′μ − r_f) / √(w′Σw)
capital market line = r_f + σ × (E[R_tan] − r_f) / σ_tan
```

The curve moves when the estimation window changes, because μ moves. Its shape
is the lesson; its exact position is provisional.

## 11. Monte Carlo

`quant/simulation/monte_carlo.py`

```
V_T = V_0 × Π_{t=1..T} (1 + r_t)
```

| Method | Draw | Trade-off |
|---|---|---|
| `normal` | Correlated multivariate normal from μ and Σ | Symmetric, thin-tailed; understates crash risk |
| `student_t` | Student-t with 5 df, rescaled to the same Σ | Same volatility, far more frequent extremes |
| `bootstrap` | Resample whole historical days with replacement | Keeps real skew, kurtosis and cross-sectional structure |

The fan chart plots percentiles of value **on each day across all simulations**,
not individual paths, so no single simulation follows the median line. Simulated
VaR and ES come from the distribution of terminal values; drawdown statistics
are computed within each path and then summarized across paths. Draws are
chunked so that simulations × horizon × assets cannot allocate an unbounded
array, and every run is seeded, so the same settings reproduce the same numbers.

## 12. Stress testing

`quant/stress/scenarios.py`

A stress test is not a probability statement: it applies one chosen adverse
assumption to current weights and reports the result.

| Kind | How the shock is derived |
|---|---|
| Market (beta) | asset shock = β_i × market shock |
| Rules | a stated move per sector, per tag, or per ticker |
| Historical replay | the actual cumulative asset moves over a real window |
| Custom | your own number on your own holdings |

Each scenario reports value before, value after, P&L, and a per-holding
breakdown with each position's share of the total loss. Where a shock has to be
approximated — an asset with no beta estimate, or one absent from a historical
window — the result says so rather than silently substituting zero.

## 13. Rebalancing

`quant/rebalancing/rebalance.py`

```
drift_i  = w_i^current − w_i^target
turnover = Σ_i |w_i^target − w_i^current|
cost     = c × turnover × portfolio value
```

Turnover is two-sided: selling 10% of one asset to buy another is 20% turnover.
One-way turnover, the figure brokers usually quote, is half of it; both are
reported so the number is never ambiguous. A rebalance is recommended only when
the largest drift exceeds the threshold, because trading costs money and a small
drift is not worth paying for. Share counts are the trade value over the latest
price, optionally rounded to whole shares. Taxes on realized gains are not
modelled.

## 14. Walk-forward backtesting

`quant/backtest/walk_forward.py`

At each rebalance date the optimizer sees a window **ending strictly before that
date**, chooses weights, pays costs on the turnover, and holds those weights
while they drift with prices until the next rebalance.

Guarantees, each asserted in code and displayed in the UI:

- the estimation window never includes the rebalance day itself;
- weights drift between rebalances rather than being silently reset;
- transaction costs are charged at every rebalance, including the first purchase;
- every strategy is scored over the same evaluation window;
- the benchmark is buy-and-hold in the index, charged the same entry cost.

Reported: total return, CAGR, annualized volatility, Sharpe, maximum drawdown,
Calmar (CAGR over the absolute worst drawdown), average turnover, total costs
and the rebalance count — plus a log of each rebalance with the window it used.

One historical path is one sample. The ranking between strategies can flip with
a different period, window or frequency, and strategies that lean hardest on
estimated expected returns tend to look better in a backtest than they behave
afterwards.

---

## What the model cannot do

- It cannot predict returns. Expected returns are estimates from past data and
  are the weakest input in the chain.
- It assumes the covariance structure persists. In a crisis, correlations move
  towards one and diversification delivers less than the matrix promised.
- It treats volatility as the definition of risk. Permanent loss of capital,
  illiquidity and leverage are risks volatility does not capture.
- It ignores taxes, spreads beyond a flat cost rate, market impact, dividend
  timing and currency effects.
- It assumes you can trade at the last close. In practice you trade at
  tomorrow's open or worse.
- It is an analysis and educational tool, not investment advice, and it never
  connects to a brokerage account.

## Synthetic market data

`quant/data/synthetic.py`

When `DATA_SOURCE=synthetic`, prices come from a documented factor model rather
than a market feed:

```
r_{i,t} = α_i/252 + β_i M_t + s_i S_{sector(i),t} − d_i RATE_t + o_i OIL_t + ε_{i,t}
```

with Student-t(5) innovations, a market-regime schedule that reproduces real
drawdown episodes on their actual dates (February–March 2020, the 2022 bear
market, April 2025) and sector-factor episodes alongside them. The resulting
return path is then anchored so that each series *ends* at a plausible price
level for that asset, and OHLC and volume are derived around the close. One
fixed seed, so every figure is reproducible.

Every formula above is applied exactly as written; only the price series is
simulated. The app labels the data source in the top bar, on `/about`, on
`/settings` and on `/methodology`, so a synthetic number is never presented as a
fact about a real company. Setting `DATA_SOURCE=yahoo` runs the same pipeline,
the same validation and the same formulas on real adjusted closes.
