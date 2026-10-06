export type User = {
  id: string;
  email: string;
  full_name: string;
  email_verified: boolean;
  is_guest: boolean;
  onboarded: boolean;
  default_portfolio_id: string | null;
  preferences: Record<string, number | string>;
  created_at: string;
  last_login_at: string | null;
};

export type Asset = {
  ticker: string;
  name: string;
  sector: string;
  asset_type: string;
  currency: string;
  tags: string[];
  is_benchmark: boolean;
  last_price: number;
  day_change_pct: number | null;
  return_1y: number | null;
  volatility_1y: number | null;
};

export type Holding = {
  id: string;
  ticker: string;
  name: string;
  sector: string;
  asset_type: string | null;
  currency: string;
  quantity: number;
  average_cost: number;
  current_price: number | null;
  invested_value: number;
  current_value: number | null;
  unrealized_pnl: number | null;
  unrealized_pnl_pct: number | null;
  day_change: number | null;
  day_change_pct: number | null;
  weight: number;
  notes: string | null;
  priced: boolean;
};

export type Valuation = {
  holdings: Holding[];
  current_value: number;
  invested_value: number;
  unrealized_pnl: number;
  total_return: number | null;
  day_change: number;
  day_change_pct: number | null;
  price_date: string | null;
  unpriced: string[];
};

export type PortfolioSummary = {
  id: string;
  name: string;
  description: string | null;
  base_currency: string;
  created_at: string;
  updated_at: string;
  holdings_count: number;
  current_value: number | null;
  invested_value: number | null;
  unrealized_pnl: number | null;
  is_default: boolean;
};

export type PortfolioDetail = {
  id: string;
  name: string;
  description: string | null;
  base_currency: string;
  created_at: string;
  updated_at: string;
  is_default: boolean;
  valuation: Valuation;
};

export type RiskMetrics = {
  expected_return: number | null;
  volatility: number | null;
  sharpe: number | null;
  sortino: number | null;
  max_drawdown: number | null;
  var_hist: number | null;
  es_hist: number | null;
  var_param: number | null;
  es_param: number | null;
  confidence: number;
  horizon_days: number;
  beta: number | null;
  tracking_error: number | null;
  information_ratio: number | null;
  realized_return: number;
  observations: number;
};

export type InputMeta = {
  start: string;
  end: string;
  observations: number;
  lookback_days: number;
  return_method: string;
  cov_method: string;
  risk_free_rate: number;
  annualization: number;
};

export type RiskContribution = {
  ticker: string;
  weight: number;
  risk_contribution: number;
  risk_pct: number;
  sector: string | null;
};

export type AssetStat = {
  ticker: string;
  name: string;
  sector: string | null;
  expected_return: number;
  volatility: number;
  cagr: number | null;
  max_drawdown: number | null;
  sharpe: number | null;
  skew: number | null;
  kurtosis: number | null;
  worst_day: number | null;
  best_day: number | null;
  beta: number | null;
  alpha: number | null;
  r_squared: number | null;
};

export type RiskPayload = {
  metrics: RiskMetrics;
  money: Record<string, number | null>;
  var_table: Record<string, Record<string, number | null>>;
  capital: number;
  confidence: number;
  horizon_days: number;
  weights: Record<string, number>;
  risk_contribution: RiskContribution[];
  correlation: { tickers: string[]; matrix: number[][]; average_pairwise: number | null };
  concentration: { hhi: number; effective_n: number; top1: number; top3: number; top5: number };
  sector_exposure: Record<string, number>;
  sector_risk: Record<string, number>;
  drawdown: {
    max_drawdown: number;
    peak_date: string | null;
    trough_date: string | null;
    recovery_date: string | null;
    max_duration_days: number;
    current_drawdown: number;
    current_duration_days: number;
  };
  series: { date: string; value: number; drawdown: number; benchmark: number | null; rolling_vol: number | null }[];
  histogram: { lo: number; hi: number; count: number }[];
  asset_stats: AssetStat[];
  factor_exposure: { beta: number; contributions: Record<string, number> } | null;
  inputs: InputMeta;
};

export type Insight = { level: "info" | "warning" | "action"; title: string; body: string; href: string };

export type Overview = {
  portfolio: { id: string; name: string; description: string | null; is_default: boolean };
  valuation: Valuation;
  risk: Pick<RiskPayload, "metrics" | "money" | "risk_contribution" | "correlation" | "concentration" | "sector_exposure" | "sector_risk" | "drawdown" | "inputs" | "factor_exposure"> | null;
  performance: {
    series: { date: string; value: number; benchmark: number | null }[];
    period_return: number;
    benchmark_return: number | null;
    rolling_63d: number | null;
    drawdown_series: { date: string; drawdown: number }[];
  } | null;
  insights: Insight[];
};

export type WeightChange = {
  ticker: string;
  name: string;
  sector: string | null;
  current_weight: number;
  optimized_weight: number;
  change: number;
  current_value: number;
  target_value: number;
  trade_value: number;
  price: number | null;
  shares: number | null;
  current_risk_pct: number;
  optimized_risk_pct: number;
};

export type OptimizeResult = {
  objective: string;
  objective_label: string;
  capital: number;
  baseline_label: string;
  current: { weights: Record<string, number>; metrics: RiskMetrics; risk_contribution: Record<string, number>; sector_exposure: Record<string, number> };
  optimized: { weights: Record<string, number>; metrics: RiskMetrics; risk_contribution: Record<string, number>; sector_exposure: Record<string, number> };
  changes: WeightChange[];
  turnover: number;
  explanation: string[];
  warnings: string[];
  constraints: Record<string, unknown>;
  inputs: InputMeta;
  assets: { ticker: string; name: string; sector: string; expected_return: number; volatility: number }[];
  portfolio_id: string | null;
  data: { source: string; as_of: string | null };
  run_id?: string;
};

export type FrontierPoint = { volatility: number; expected_return: number; sharpe: number | null; weights?: Record<string, number> };

export type FrontierResult = {
  frontier: FrontierPoint[];
  tangency: { weights: Record<string, number>; expected_return: number; volatility: number; sharpe: number | null };
  min_variance: { weights: Record<string, number>; expected_return: number; volatility: number; sharpe: number | null };
  random_portfolios: FrontierPoint[];
  assets: { ticker: string; volatility: number; expected_return: number }[];
  cml: { volatility: number; expected_return: number }[];
  risk_free_rate: number;
  current: { label: string; volatility: number; expected_return: number; sharpe: number | null };
  selected: { weights: Record<string, number>; expected_return: number; volatility: number; sharpe: number | null } | null;
  selected_label: string | null;
  constraints: Record<string, unknown>;
  inputs: InputMeta;
};

export type Scenario = { id: string; name: string; description: string; kind: string; assumptions: string[]; start: string | null; end: string | null };

export type StressContribution = {
  ticker: string;
  name?: string;
  sector?: string | null;
  beta?: number | null;
  weight: number;
  value_before: number;
  shock: number;
  pnl: number;
  value_after: number;
  contribution_pct: number;
  share_of_loss: number;
};

export type StressResult = {
  scenario: Scenario;
  value_before: number;
  value_after: number;
  pnl: number;
  pct_change: number;
  contributions: StressContribution[];
  largest_contributors: StressContribution[];
  notes: string[];
  disclaimer: string;
};

export type StressPayload = {
  capital: number;
  results: StressResult[];
  betas: Record<string, number>;
  worst: { scenario: string; pct_change: number; pnl: number } | null;
  inputs: InputMeta;
};

export type MonteCarloResult = {
  n_sims: number;
  horizon_days: number;
  initial_value: number;
  method: string;
  assumptions: string;
  terminal: { mean: number; median: number; p1: number; p5: number; p95: number; p99: number; best: number; worst: number };
  expected_return: number;
  median_return: number;
  prob_loss: number;
  prob_loss_threshold: number;
  loss_threshold: number;
  var_95: number;
  es_95: number;
  var_99: number;
  es_99: number;
  max_drawdown: { median: number; p5: number; mean: number };
  bands: { day: number; p1: number; p5: number; p25: number; p50: number; p75: number; p95: number; p99: number }[];
  sample_paths: number[][];
  sample_days: number[];
  histogram: { lo: number; hi: number; count: number }[];
  target_value?: number;
  prob_target?: number;
  weights: Record<string, number>;
  inputs: InputMeta;
};

export type Trade = {
  ticker: string;
  name?: string;
  current_weight: number;
  target_weight: number;
  drift: number;
  breach: boolean;
  trade_weight: number;
  trade_value: number;
  shares: number | null;
  price: number | null;
  action: "buy" | "sell" | "hold";
  current_shares?: number;
};

export type RebalancePlan = {
  rebalance_recommended: boolean;
  max_drift: number;
  threshold: number;
  turnover: number;
  one_way_turnover: number;
  cost_rate: number;
  estimated_cost: number;
  portfolio_value: number;
  value_after_costs: number;
  trades: Trade[];
  convention: string;
  target_label: string;
  run_id?: string;
};

export type BacktestMetrics = {
  label: string;
  final_value: number;
  total_return: number;
  cagr: number | null;
  volatility: number;
  sharpe: number | null;
  max_drawdown: number;
  calmar: number | null;
  avg_turnover: number;
  total_costs: number;
  rebalances: number;
};

export type BacktestResult = {
  start: string;
  end: string;
  lookback: number;
  frequency: string;
  cost_rate: number;
  initial_capital: number;
  observations: number;
  risk_free_rate: number;
  return_method: string;
  cov_method: string;
  strategies: string[];
  labels: Record<string, string>;
  metrics: Record<string, BacktestMetrics>;
  series: Record<string, number | string>[];
  rebalances: Record<string, { date: string; window_start?: string; window_end?: string; turnover: number; cost: number; note: string | null; weights?: Record<string, number> }[]>;
  integrity: {
    no_lookahead: boolean;
    estimation_windows_end_before_rebalance: boolean;
    same_evaluation_window: boolean;
    transaction_costs_applied: boolean;
    rebalance_dates: string[];
  };
  max_single_asset: number;
  tickers: string[];
};

export type WhatIfResult = {
  type: string;
  description: string;
  value_before: number;
  value_after: number;
  value_change: number;
  pnl: number;
  pct_change: number;
  transaction_cost: number;
  cash_added: number;
  invested_before: number;
  invested_after: number;
  unrealized_pnl_before: number;
  unrealized_pnl_after: number;
  holdings: { ticker: string; weight_before: number; weight_after: number; value_before: number; value_after: number; pnl: number }[];
  largest_contributors: { ticker: string; pnl: number }[];
  risk_before: Record<string, number | null>;
  risk_after: Record<string, number | null>;
  inputs: InputMeta;
};

export type DataStatus = {
  source: string;
  synthetic: boolean;
  last_updated: string | null;
  first_date: string | null;
  last_date: string | null;
  assets: number;
  last_run: { status: string; message: string | null; started_at: string | null } | null;
};

export type RunSummary = {
  run_id: string;
  name: string | null;
  objective: string;
  objective_label: string;
  portfolio_id: string | null;
  capital: number;
  created_at: string;
  expected_return: number | null;
  volatility: number | null;
  sharpe: number | null;
  weights: Record<string, number>;
};

export type Preferences = {
  risk_free_rate: number;
  lookback_days: number;
  confidence: number;
  cost_rate: number;
  rebalance_threshold: number;
  return_method: string;
  cov_method: string;
  default_objective: string;
  max_weight: number;
  mc_sims: number;
  mc_horizon_days: number;
};
