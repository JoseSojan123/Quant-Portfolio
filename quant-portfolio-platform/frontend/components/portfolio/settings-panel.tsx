"use client";

import { ChevronDown } from "lucide-react";
import { useState, type ReactNode } from "react";

import { Field, NumberInput, Select, Slider, Toggle } from "@/components/ui";
import { pct } from "@/lib/format";

export const OBJECTIVES = [
  { value: "max_sharpe", label: "Maximum Sharpe" },
  { value: "min_variance", label: "Minimum variance" },
  { value: "target_return", label: "Target return" },
  { value: "risk_parity", label: "Risk parity" },
  { value: "equal_weight", label: "Equal weight (baseline)" },
];

export const RETURN_METHODS = [
  { value: "historical", label: "Historical mean (noisy)" },
  { value: "bayes_stein", label: "Bayes-Stein shrinkage" },
  { value: "capm", label: "CAPM equilibrium" },
];

export const COV_METHODS = [
  { value: "sample", label: "Sample covariance" },
  { value: "ledoit_wolf", label: "Ledoit-Wolf shrinkage" },
  { value: "ewma", label: "EWMA (lambda 0.94)" },
];

export const LOOKBACKS = [
  { value: "252", label: "1 year (252 days)" },
  { value: "504", label: "2 years" },
  { value: "756", label: "3 years" },
  { value: "1260", label: "5 years" },
];

/** Collapsible "advanced estimation settings" block shared by the analytics pages. */
export function Disclosure({ title, children, defaultOpen = false }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t border-hair">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-[48px] w-full items-center justify-between px-5 text-left text-[15px] font-medium text-ink transition hover:text-brand-600 sm:px-6 sm:text-sm"
      >
        {title}
        <ChevronDown className={`h-4 w-4 text-ink-3 transition duration-300 ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? <div className="card-pad pt-0">{children}</div> : null}
    </div>
  );
}

export type EstimationState = {
  lookback_days: number;
  return_method: string;
  cov_method: string;
  risk_free_rate: number;
};

export function EstimationControls({ value, onChange }: { value: EstimationState; onChange: (v: EstimationState) => void }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Field label="Estimation window" htmlFor="lookback" hint="Longer windows are more stable but slower to adapt.">
        <Select
          id="lookback"
          value={String(value.lookback_days)}
          onChange={(v) => onChange({ ...value, lookback_days: Number(v) })}
          options={LOOKBACKS}
        />
      </Field>
      <Field label="Risk-free rate" htmlFor="rf" hint="Used in the Sharpe ratio and for cash.">
        <NumberInput id="rf" value={value.risk_free_rate * 100} onChange={(v) => onChange({ ...value, risk_free_rate: (typeof v === "number" ? v : 0) / 100 })} min={-5} max={25} step={0.1} suffix="%" />
      </Field>
      <Field label="Expected returns" htmlFor="rm" hint="Historical means are the noisiest input in mean-variance optimization.">
        <Select id="rm" value={value.return_method} onChange={(v) => onChange({ ...value, return_method: v })} options={RETURN_METHODS} />
      </Field>
      <Field label="Covariance" htmlFor="cm" hint="Shrinkage stabilizes the matrix when assets outnumber the data.">
        <Select id="cm" value={value.cov_method} onChange={(v) => onChange({ ...value, cov_method: v })} options={COV_METHODS} />
      </Field>
    </div>
  );
}

export type ConstraintState = {
  max_single_asset: number;
  min_weight: number;
  cash_floor: number;
  sector_caps: Record<string, number>;
  target_return: number;
  turnover_cap: number | null;
  long_only: boolean;
};

export const DEFAULT_CONSTRAINTS: ConstraintState = {
  max_single_asset: 0.3,
  min_weight: 0,
  cash_floor: 0,
  sector_caps: {},
  target_return: 0.1,
  turnover_cap: null,
  long_only: true,
};

export function ConstraintControls({
  value,
  onChange,
  sectors,
  objective,
  nAssets,
}: {
  value: ConstraintState;
  onChange: (v: ConstraintState) => void;
  sectors: string[];
  objective: string;
  nAssets: number;
}) {
  const minFeasible = nAssets > 0 ? 1 / nAssets : 0;
  const infeasible = value.max_single_asset * nAssets < 1 - 1e-9;
  return (
    <div className="space-y-4">
      <Slider
        label="Maximum weight per asset"
        display={pct(value.max_single_asset, 0)}
        min={0.05}
        max={1}
        step={0.05}
        value={value.max_single_asset}
        onChange={(v) => onChange({ ...value, max_single_asset: v })}
      />
      {infeasible ? (
        <p className="-mt-2 text-xs text-warn">
          With {nAssets} assets, the cap must be at least {pct(minFeasible, 0)} for the weights to sum to 100%.
        </p>
      ) : null}

      <Slider
        label="Minimum holding (if selected)"
        display={value.min_weight === 0 ? "off" : pct(value.min_weight, 0)}
        min={0}
        max={0.2}
        step={0.01}
        value={value.min_weight}
        onChange={(v) => onChange({ ...value, min_weight: v })}
      />
      <Slider
        label="Cash floor"
        display={value.cash_floor === 0 ? "none" : pct(value.cash_floor, 0)}
        min={0}
        max={0.5}
        step={0.05}
        value={value.cash_floor}
        onChange={(v) => onChange({ ...value, cash_floor: v })}
      />
      {objective === "target_return" ? (
        <Slider
          label="Target annual return (minimum)"
          display={pct(value.target_return, 0)}
          min={0}
          max={0.6}
          step={0.01}
          value={value.target_return}
          onChange={(v) => onChange({ ...value, target_return: v })}
        />
      ) : null}

      <Toggle
        checked={value.turnover_cap !== null}
        onChange={(on) => onChange({ ...value, turnover_cap: on ? 0.4 : null })}
        label="Limit turnover from my current weights"
        hint="Keeps the recommendation close to what you already hold."
      />
      {value.turnover_cap !== null ? (
        <Slider
          label="Turnover cap"
          display={pct(value.turnover_cap, 0)}
          min={0.05}
          max={2}
          step={0.05}
          value={value.turnover_cap}
          onChange={(v) => onChange({ ...value, turnover_cap: v })}
        />
      ) : null}

      {sectors.length > 1 ? (
        <div>
          <p className="label mb-2">Sector caps</p>
          <div className="space-y-2">
            {sectors.map((s) => {
              const on = s in value.sector_caps;
              return (
                <div key={s} className="flex items-center gap-3">
                  <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-sm text-ink-2">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={(e) => {
                        const next = { ...value.sector_caps };
                        if (e.target.checked) next[s] = 0.4;
                        else delete next[s];
                        onChange({ ...value, sector_caps: next });
                      }}
                      className="h-4 w-4 rounded border-line accent-brand-600"
                    />
                    <span className="truncate">{s}</span>
                  </label>
                  {on ? (
                    <NumberInput
                      className="w-24"
                      value={Math.round(value.sector_caps[s] * 100)}
                      onChange={(v) => onChange({ ...value, sector_caps: { ...value.sector_caps, [s]: (typeof v === "number" ? v : 0) / 100 } })}
                      min={1}
                      max={100}
                      step={5}
                      suffix="%"
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function constraintPayload(c: ConstraintState, objective: string, currentWeights?: Record<string, number>) {
  return {
    long_only: c.long_only,
    max_single_asset: c.max_single_asset,
    min_weight: c.min_weight,
    cash_floor: c.cash_floor,
    sector_caps: c.sector_caps,
    ...(objective === "target_return" ? { target_return: c.target_return } : {}),
    ...(c.turnover_cap !== null ? { turnover_cap: c.turnover_cap, current_weights: currentWeights } : {}),
  };
}
