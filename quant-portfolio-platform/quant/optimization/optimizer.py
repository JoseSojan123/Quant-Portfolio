"""Constrained portfolio optimization (blueprint Stages 5 and 15, KB sections 9-10).

Objectives
  min_variance   minimize w' Sigma w
  max_sharpe     maximize (w' mu - Rf) / sqrt(w' Sigma w)
  target_return  minimize w' Sigma w  subject to  w' mu >= target
  risk_parity    equalize each asset's share of portfolio risk
  equal_weight   1/N baseline (not an optimization, used for comparison)

Constraints
  fully invested      sum(w) = 1
  long only           w_i >= 0
  single-asset cap    w_i <= max_weight
  minimum holding     w_i = 0 or w_i >= min_weight          (semi-continuous)
  sector caps         sum(w_i for i in sector) <= cap
  cash floor          adds a CASH asset (return = Rf, zero risk) held at the floor
  turnover cap        sum |w_i - w_current_i| <= cap

All problems are solved with SciPy's SLSQP using analytic gradients where
available. The optimizer is not an oracle: it returns the best allocation for
*these* inputs, objective and constraints, and inherits all estimation error.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd
from scipy.optimize import linprog, minimize

from quant.risk.metrics import portfolio_return, portfolio_volatility, risk_contribution, sharpe_ratio

OBJECTIVES = ("min_variance", "max_sharpe", "target_return", "risk_parity", "equal_weight")
CASH = "CASH"
_TOL = 1e-6


class OptimizationError(ValueError):
    """Raised when the requested problem is infeasible or the solver fails."""


@dataclass
class Constraints:
    long_only: bool = True
    max_weight: float = 1.0
    min_weight: float = 0.0
    sector_caps: dict[str, float] = field(default_factory=dict)
    cash_floor: float = 0.0
    target_return: float | None = None
    turnover_cap: float | None = None
    current_weights: dict[str, float] | None = None


@dataclass
class OptimizationResult:
    objective: str
    weights: pd.Series
    expected_return: float
    volatility: float
    sharpe: float
    risk_contribution: pd.Series
    success: bool
    message: str
    warnings: list[str] = field(default_factory=list)
    turnover: float | None = None

    def as_dict(self) -> dict:
        return {
            "objective": self.objective,
            "weights": {k: float(v) for k, v in self.weights.items()},
            "expected_return": self.expected_return,
            "volatility": self.volatility,
            "sharpe": None if not np.isfinite(self.sharpe) else self.sharpe,
            "risk_contribution": {k: float(v) for k, v in self.risk_contribution.items()},
            "success": self.success,
            "message": self.message,
            "warnings": self.warnings,
            "turnover": self.turnover,
        }


@dataclass
class _Problem:
    tickers: list[str]
    mu: np.ndarray
    cov: np.ndarray
    sectors: list[str]
    lb: np.ndarray
    ub: np.ndarray
    c: Constraints
    rf: float
    w0: np.ndarray | None  # current weights for turnover

    @property
    def n(self) -> int:
        return len(self.tickers)

    @property
    def has_cash(self) -> bool:
        return CASH in self.tickers


def _build_problem(mu: pd.Series, cov: pd.DataFrame, c: Constraints, rf: float,
                   sectors: dict[str, str] | None) -> _Problem:
    if not 0 < c.max_weight <= 1:
        raise OptimizationError("max_weight must be in (0, 1]")
    if c.min_weight < 0 or c.min_weight > c.max_weight:
        raise OptimizationError("min_weight must be between 0 and max_weight")
    if not 0 <= c.cash_floor < 1:
        raise OptimizationError("cash_floor must be in [0, 1)")
    tickers = list(mu.index)
    if len(tickers) == 0:
        raise OptimizationError("no assets supplied")
    cov = cov.loc[tickers, tickers]
    m = mu.to_numpy(dtype=float)
    s = cov.to_numpy(dtype=float)
    s = 0.5 * (s + s.T)
    sec = [(sectors or {}).get(t, "Other") for t in tickers]
    lo = 0.0 if c.long_only else -c.max_weight
    lb = np.full(len(tickers), lo)
    ub = np.full(len(tickers), c.max_weight)
    if c.cash_floor > 0:
        tickers = tickers + [CASH]
        m = np.append(m, rf)
        s = np.pad(s, ((0, 1), (0, 1)))
        sec.append("Cash")
        # Cash is held exactly at the floor: max-Sharpe is indifferent to cash and
        # min-variance would otherwise move everything into it.
        lb = np.append(lb, c.cash_floor)
        ub = np.append(ub, c.cash_floor)
    w0 = None
    if c.turnover_cap is not None:
        cw = c.current_weights or {}
        w0 = np.array([float(cw.get(t, 0.0)) for t in tickers])
    return _Problem(tickers, m, s, sec, lb, ub, c, rf, w0)


def _check_feasibility(p: _Problem) -> None:
    risky = [i for i, t in enumerate(p.tickers) if t != CASH]
    capacity = 0.0
    by_sector: dict[str, float] = {}
    for i in risky:
        by_sector[p.sectors[i]] = by_sector.get(p.sectors[i], 0.0) + p.ub[i]
    for s, cap in by_sector.items():
        capacity += min(cap, p.c.sector_caps.get(s, np.inf))
    if p.has_cash:
        capacity += p.c.cash_floor
    if capacity < 1 - 1e-9:
        n = len(risky)
        hint = f"With {n} assets and a {p.c.max_weight:.0%} cap, at most {capacity:.0%} can be invested."
        raise OptimizationError(f"Constraints are infeasible: weights cannot sum to 100%. {hint} "
                                "Add assets, raise the max weight, relax sector caps or add a cash floor.")
    if p.has_cash and p.c.cash_floor > 1 - 1e-9:
        raise OptimizationError("cash floor leaves nothing to invest")


def _constraint_list(p: _Problem, nvar: int, *, target: float | None = None, target_eq: bool = False) -> list[dict]:
    n = p.n
    cons: list[dict] = [{
        "type": "eq",
        "fun": lambda x: np.sum(x[:n]) - 1.0,
        "jac": lambda x: np.concatenate([np.ones(n), np.zeros(nvar - n)]),
    }]
    for sector, cap in p.c.sector_caps.items():
        idx = np.array([i for i, s in enumerate(p.sectors) if s == sector])
        if idx.size == 0:
            continue
        g = np.zeros(nvar)
        g[idx] = -1.0
        cons.append({"type": "ineq", "fun": lambda x, idx=idx, cap=cap: cap - np.sum(x[idx]),
                     "jac": lambda x, g=g: g})
    if target is not None:
        g = np.concatenate([p.mu, np.zeros(nvar - n)])
        cons.append({"type": "eq" if target_eq else "ineq",
                     "fun": lambda x: p.mu @ x[:n] - target, "jac": lambda x: g})
    if p.w0 is not None:
        cap = float(p.c.turnover_cap)
        eye = np.eye(n)
        j1 = np.hstack([-eye, eye])   # t - (w - w0) >= 0
        j2 = np.hstack([eye, eye])    # t + (w - w0) >= 0
        j3 = np.concatenate([np.zeros(n), -np.ones(n)])[None, :]
        cons.append({
            "type": "ineq",
            "fun": lambda x: np.concatenate([x[n:] - (x[:n] - p.w0), x[n:] + (x[:n] - p.w0), [cap - x[n:].sum()]]),
            "jac": lambda x: np.vstack([j1, j2, j3]),
        })
    return cons


def _start_point(p: _Problem, lb: np.ndarray, ub: np.ndarray) -> np.ndarray:
    w = np.clip(np.full(p.n, 1.0 / p.n), lb, ub)
    for _ in range(50):
        gap = 1.0 - w.sum()
        if abs(gap) < 1e-12:
            break
        room = (ub - w) if gap > 0 else (w - lb)
        if room.sum() <= 1e-12:
            break
        w = np.clip(w + gap * room / room.sum(), lb, ub)
    if p.w0 is not None:
        # Starting at the current portfolio satisfies the turnover cap trivially.
        if abs(p.w0.sum() - 1) < 1e-6 and np.all(p.w0 >= lb - 1e-9) and np.all(p.w0 <= ub + 1e-9):
            w = p.w0.copy()
    return w


def _solve(p: _Problem, objective: str, lb: np.ndarray, ub: np.ndarray, *, target: float | None = None,
           target_eq: bool = False, x0: np.ndarray | None = None) -> tuple[np.ndarray, bool, str]:
    n = p.n
    use_t = p.w0 is not None
    nvar = 2 * n if use_t else n
    mu, cov, rf = p.mu, p.cov, p.rf

    def pad(g):
        return np.concatenate([g, np.zeros(nvar - n)]) if use_t else g

    if objective in ("min_variance", "target_return"):
        scale = 1.0 / max(np.mean(np.diag(cov)), 1e-12)

        def f(x):
            w = x[:n]
            return scale * (w @ cov @ w)

        def jac(x):
            return pad(scale * 2.0 * cov @ x[:n])
    elif objective == "max_sharpe":
        def f(x):
            w = x[:n]
            sd = np.sqrt(max(w @ cov @ w, 1e-16))
            return -(w @ mu - rf) / sd

        def jac(x):
            w = x[:n]
            var = max(w @ cov @ w, 1e-16)
            sd = np.sqrt(var)
            ex = w @ mu - rf
            return pad(-(mu * sd - ex * (cov @ w) / sd) / var)
    elif objective == "max_return":
        def f(x):
            return -(x[:n] @ mu)

        def jac(x):
            return pad(-mu)
    elif objective == "risk_parity":
        risky = np.array([t != CASH for t in p.tickers])
        k = risky.sum()

        def f(x):
            w = x[:n]
            var = max(w @ cov @ w, 1e-16)
            share = (w * (cov @ w) / var)[risky]
            return 1e3 * np.sum((share - 1.0 / k) ** 2)

        jac = None
    else:
        raise OptimizationError(f"unknown objective {objective!r}")

    w_start = x0 if x0 is not None else _start_point(p, lb, ub)
    w_start = np.clip(w_start, lb, ub)
    if use_t:
        t_start = np.abs(w_start - p.w0) + 1e-9
        x_start = np.concatenate([w_start, t_start])
        bounds = list(zip(lb, ub, strict=True)) + [(0.0, 2.0)] * n
    else:
        x_start = w_start
        bounds = list(zip(lb, ub, strict=True))
    cons = _constraint_list(p, nvar, target=target, target_eq=target_eq)
    res = minimize(f, x_start, jac=jac, bounds=bounds, constraints=cons, method="SLSQP",
                   options={"maxiter": 1000, "ftol": 1e-12})
    w = res.x[:n]
    return w, bool(res.success), str(res.message)


def _violations(p: _Problem, w: np.ndarray, lb: np.ndarray, ub: np.ndarray, target: float | None) -> list[str]:
    v = []
    if abs(w.sum() - 1) > 1e-4:
        v.append(f"weights sum to {w.sum():.4f}")
    if np.any(w < lb - 1e-4) or np.any(w > ub + 1e-4):
        v.append("weight bounds violated")
    for s, cap in p.c.sector_caps.items():
        tot = sum(w[i] for i, sec in enumerate(p.sectors) if sec == s)
        if tot > cap + 1e-4:
            v.append(f"{s} weight {tot:.1%} exceeds cap {cap:.0%}")
    if target is not None and p.mu @ w < target - 1e-4:
        v.append(f"expected return {p.mu @ w:.2%} below target {target:.2%}")
    if p.w0 is not None and np.abs(w - p.w0).sum() > float(p.c.turnover_cap) + 1e-4:
        v.append("turnover cap violated")
    return v


def max_feasible_return(p: _Problem) -> float:
    """Highest expected return any feasible portfolio can reach (linear program, ignores turnover)."""
    a_ub, b_ub = [], []
    for s, cap in p.c.sector_caps.items():
        row = np.array([1.0 if sec == s else 0.0 for sec in p.sectors])
        if row.any():
            a_ub.append(row)
            b_ub.append(cap)
    res = linprog(-p.mu, A_ub=np.array(a_ub) if a_ub else None, b_ub=np.array(b_ub) if b_ub else None,
                  A_eq=np.ones((1, p.n)), b_eq=[1.0], bounds=list(zip(p.lb, p.ub, strict=True)), method="highs")
    return float(-res.fun) if res.success else float(np.max(p.mu))


def _risk_parity_start(p: _Problem) -> np.ndarray:
    """Equal-risk-contribution solution (Spinu's convex formulation), long only, no other constraints."""
    risky = np.array([t != CASH for t in p.tickers])
    cov = p.cov[np.ix_(risky, risky)]
    k = risky.sum()
    b = np.full(k, 1.0 / k)
    vol = np.sqrt(np.clip(np.diag(cov), 1e-12, None))
    y0 = (1 / vol) / (1 / vol).sum()
    res = minimize(lambda y: 0.5 * y @ cov @ y - b @ np.log(y), y0, jac=lambda y: cov @ y - b / y,
                   bounds=[(1e-10, None)] * k, method="L-BFGS-B")
    y = res.x / res.x.sum()
    w = np.zeros(p.n)
    invest = 1.0 - (p.c.cash_floor if p.has_cash else 0.0)
    w[risky] = y * invest
    if p.has_cash:
        w[~risky] = p.c.cash_floor
    return w


def _finalize(p: _Problem, objective: str, w: np.ndarray, success: bool, message: str,
              warnings: list[str]) -> OptimizationResult:
    w = np.where(np.abs(w) < 1e-7, 0.0, w)
    if w.sum() != 0:
        w = w / w.sum()
    weights = pd.Series(w, index=p.tickers)
    exp_ret = portfolio_return(w, p.mu)
    vol = portfolio_volatility(w, p.cov)
    _, pct = risk_contribution(w, p.cov)
    turnover = float(np.abs(w - p.w0).sum()) if p.w0 is not None else None
    return OptimizationResult(objective=objective, weights=weights, expected_return=exp_ret, volatility=vol,
                              sharpe=sharpe_ratio(exp_ret, vol, p.rf), risk_contribution=pd.Series(pct, index=p.tickers),
                              success=success, message=message, warnings=warnings, turnover=turnover)


def optimize(
    mu: pd.Series,
    cov: pd.DataFrame,
    objective: str = "max_sharpe",
    constraints: Constraints | None = None,
    risk_free_rate: float = 0.0,
    sectors: dict[str, str] | None = None,
) -> OptimizationResult:
    """Solve one portfolio-construction problem. ``mu``/``cov`` are annualized."""
    c = constraints or Constraints()
    if objective not in OBJECTIVES:
        raise OptimizationError(f"unknown objective {objective!r}; expected one of {OBJECTIVES}")
    if objective == "risk_parity" and not c.long_only:
        raise OptimizationError("risk parity requires long-only weights")
    p = _build_problem(mu, cov, c, risk_free_rate, sectors)
    _check_feasibility(p)
    warnings: list[str] = []

    if objective == "equal_weight":
        w = np.zeros(p.n)
        risky = np.array([t != CASH for t in p.tickers])
        w[risky] = (1.0 - (c.cash_floor if p.has_cash else 0.0)) / risky.sum()
        if p.has_cash:
            w[~risky] = c.cash_floor
        v = _violations(p, w, p.lb, p.ub, None)
        if v:
            warnings.append("Equal weight breaks some constraints: " + "; ".join(v))
        return _finalize(p, objective, w, True, "equal weight baseline", warnings)

    target = None
    if objective == "target_return":
        if c.target_return is None:
            raise OptimizationError("target_return objective needs constraints.target_return")
        target = float(c.target_return)
        best = max_feasible_return(p)
        if target > best + 1e-9:
            raise OptimizationError(f"Target return {target:.2%} is not achievable under these constraints; "
                                    f"the highest feasible expected return is {best:.2%}.")

    if objective == "max_sharpe" and np.all(p.mu[[t != CASH for t in p.tickers]] <= risk_free_rate):
        warnings.append("Every asset's expected return is below the risk-free rate, so the maximum-Sharpe "
                        "portfolio is the least-bad option rather than an attractive one.")

    lb, ub = p.lb.copy(), p.ub.copy()

    def run(lb, ub):
        starts = [None]
        if objective == "max_sharpe":
            w_mv, ok, _ = _solve(p, "min_variance", lb, ub)
            if ok:
                starts.append(w_mv)
        if objective == "risk_parity":
            starts = [_risk_parity_start(p)]
        best_w, best_ok, best_msg, best_val = None, False, "", np.inf
        for x0 in starts:
            w, ok, msg = _solve(p, objective, lb, ub, target=target, x0=x0)
            viol = _violations(p, w, lb, ub, target)
            val = _objective_value(p, objective, w)
            feasible = not viol
            if (feasible and (not best_ok or val < best_val)) or best_w is None:
                best_w, best_ok, best_msg, best_val = w, feasible, msg if ok else msg, val
        return best_w, best_ok, best_msg

    w, ok, msg = run(lb, ub)

    # Minimum-holding (semi-continuous) constraint: drop tiny positions, floor the rest, re-solve.
    if c.min_weight > 0 and ok:
        for _ in range(6):
            risky = np.array([t != CASH for t in p.tickers])
            small = risky & (w > _TOL) & (w < c.min_weight - 1e-5)
            if not small.any():
                break
            drop = small & (w < c.min_weight / 2)
            if not drop.any():
                drop = small & (w == w[small].min())
            ub = ub.copy()
            lb = lb.copy()
            ub[drop] = 0.0
            lb[drop] = 0.0
            keep = risky & ~drop & (w >= c.min_weight / 2)
            lb[keep] = np.maximum(lb[keep], c.min_weight)
            if ub[risky].sum() + (c.cash_floor if p.has_cash else 0.0) < 1 - 1e-9:
                warnings.append("Minimum-holding rule could not be fully applied without breaking the max-weight cap.")
                break
            w2, ok2, msg2 = run(lb, ub)
            if not ok2:
                warnings.append("Minimum-holding rule made the problem infeasible; showing the closest solution.")
                break
            w, ok, msg = w2, ok2, msg2

    if not ok:
        viol = _violations(p, w, lb, ub, target)
        raise OptimizationError("The optimizer could not find a portfolio that satisfies every constraint"
                                + (f" ({'; '.join(viol)})" if viol else "") + ". Try relaxing the constraints.")
    if objective == "risk_parity":
        _, pct = risk_contribution(w, p.cov)
        risky = np.array([t != CASH for t in p.tickers])
        spread = pct[risky].max() - pct[risky].min()
        if spread > 0.02:
            warnings.append("Constraints prevent exactly equal risk contributions; this is the closest feasible allocation.")
    return _finalize(p, objective, w, True, msg, warnings)


def _objective_value(p: _Problem, objective: str, w: np.ndarray) -> float:
    var = float(w @ p.cov @ w)
    if objective in ("min_variance", "target_return"):
        return var
    if objective == "max_sharpe":
        return -(w @ p.mu - p.rf) / np.sqrt(max(var, 1e-16))
    if objective == "risk_parity":
        risky = np.array([t != CASH for t in p.tickers])
        share = (w * (p.cov @ w) / max(var, 1e-16))[risky]
        return float(np.sum((share - 1 / risky.sum()) ** 2))
    return 0.0


# --- efficient frontier -------------------------------------------------------------------


def efficient_frontier(
    mu: pd.Series,
    cov: pd.DataFrame,
    constraints: Constraints | None = None,
    risk_free_rate: float = 0.0,
    sectors: dict[str, str] | None = None,
    n_points: int = 30,
    n_random: int = 1500,
    seed: int = 7,
) -> dict:
    """Frontier points, the tangency portfolio, random feasible portfolios and the CML."""
    c = constraints or Constraints()
    c_front = Constraints(long_only=c.long_only, max_weight=c.max_weight, sector_caps=dict(c.sector_caps),
                          cash_floor=c.cash_floor)
    p = _build_problem(mu, cov, c_front, risk_free_rate, sectors)
    _check_feasibility(p)
    w_mv, ok, _ = _solve(p, "min_variance", p.lb, p.ub)
    if not ok:
        raise OptimizationError("could not compute the minimum-variance portfolio")
    r_min = float(p.mu @ w_mv)
    r_max = max_feasible_return(p)
    points = []
    prev = w_mv
    for target in np.linspace(r_min, r_max, n_points):
        w, ok, _ = _solve(p, "min_variance", p.lb, p.ub, target=float(target), target_eq=True, x0=prev)
        if ok and not _violations(p, w, p.lb, p.ub, None) and abs(p.mu @ w - target) < 1e-4:
            prev = w
            vol = portfolio_volatility(w, p.cov)
            ret = float(p.mu @ w)
            points.append({"volatility": vol, "expected_return": ret, "sharpe": sharpe_ratio(ret, vol, risk_free_rate),
                           "weights": {t: float(x) for t, x in zip(p.tickers, w, strict=True) if abs(x) > 1e-6}})
    tangency = optimize(mu, cov, "max_sharpe", c_front, risk_free_rate, sectors)
    min_var = _finalize(p, "min_variance", w_mv, True, "", [])

    rng = np.random.default_rng(seed)
    rand = []
    risky = np.array([t != CASH for t in p.tickers])
    k = int(risky.sum())
    for _ in range(n_random):
        w = np.zeros(p.n)
        invest = 1.0 - (c_front.cash_floor if p.has_cash else 0.0)
        w[risky] = _capped_dirichlet(rng, k, c_front.max_weight / invest if invest > 0 else 1.0) * invest
        if p.has_cash:
            w[~risky] = 1.0 - w[risky].sum()
        if c_front.sector_caps and _violations(p, w, p.lb, p.ub, None):
            continue
        vol = portfolio_volatility(w, p.cov)
        ret = float(p.mu @ w)
        rand.append({"volatility": vol, "expected_return": ret, "sharpe": sharpe_ratio(ret, vol, risk_free_rate)})

    assets = [{"ticker": t, "volatility": float(np.sqrt(max(p.cov[i, i], 0))), "expected_return": float(p.mu[i])}
              for i, t in enumerate(p.tickers) if t != CASH]
    max_vol = max([a["volatility"] for a in assets] + [pt["volatility"] for pt in points] + [1e-9])
    cml = []
    if tangency.volatility > 1e-9 and np.isfinite(tangency.sharpe):
        for v in np.linspace(0, max_vol * 1.05, 20):
            cml.append({"volatility": float(v), "expected_return": float(risk_free_rate + tangency.sharpe * v)})
    return {"frontier": points, "tangency": tangency.as_dict(), "min_variance": min_var.as_dict(),
            "random_portfolios": rand, "assets": assets, "cml": cml, "risk_free_rate": risk_free_rate}


def _capped_dirichlet(rng: np.random.Generator, k: int, cap: float) -> np.ndarray:
    """Random long-only weights summing to 1 with every weight <= cap (if feasible)."""
    w = rng.dirichlet(np.full(k, 0.6))
    if cap >= 1 or cap * k < 1:
        return w
    for _ in range(100):
        over = w > cap
        if not over.any():
            break
        excess = (w[over] - cap).sum()
        w[over] = cap
        under = ~over
        w[under] += excess * w[under] / w[under].sum()
    return w
