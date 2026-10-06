"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";

import { PageHeader } from "@/components/layout/page-header";
import { COV_METHODS, LOOKBACKS, OBJECTIVES, RETURN_METHODS } from "@/components/portfolio/settings-panel";
import { Alert, Button, Card, CardHead, Field, HowCalculated, LinkButton, NumberInput, Select, Skeleton, Slider } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { pct } from "@/lib/format";
import { useAuth } from "@/lib/auth";
import type { DataStatus, Preferences } from "@/lib/types";

const CONFIDENCES = [
  { value: "0.9", label: "90%" },
  { value: "0.95", label: "95% (standard)" },
  { value: "0.99", label: "99%" },
];

const MC_HORIZONS = [
  { value: "21", label: "1 month" },
  { value: "63", label: "3 months" },
  { value: "126", label: "6 months" },
  { value: "252", label: "1 year" },
  { value: "504", label: "2 years" },
];

export default function SettingsPage() {
  const { user } = useAuth();
  const { data, mutate } = useSWR<Preferences>("/me/preferences");
  const { data: status } = useSWR<DataStatus>("/meta/data-status");

  const [form, setForm] = useState<Preferences | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (data && !form) setForm(data);
  }, [data, form]);

  function set<K extends keyof Preferences>(key: K, value: Preferences[K]) {
    setForm((f) => (f ? { ...f, [key]: value } : f));
    setSaved(false);
  }

  async function save() {
    if (!form) return;
    setBusy(true);
    setError(null);
    try {
      const next = await api<Preferences>("/me/preferences", { method: "PUT", body: form });
      await mutate(next, { revalidate: false });
      setForm(next);
      setSaved(true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (!form) return <Skeleton className="h-96" />;

  const dirty = data ? JSON.stringify(form) !== JSON.stringify(data) : false;

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="Defaults for every analysis in the app. Each page can still override them for a single run."
        help={
          <>
            These are modelling choices, not cosmetic preferences. The estimation window and the two estimators decide the
            numbers the optimizer sees, so changing them changes every recommendation the app makes.
          </>
        }
      >
        <Button onClick={save} loading={busy} disabled={!dirty}>
          {dirty ? "Save changes" : "Saved"}
        </Button>
      </PageHeader>

      {error ? <Alert kind="error">{error}</Alert> : null}
      {saved ? (
        <div className="mb-4">
          <Alert kind="success" onClose={() => setSaved(false)}>
            Preferences saved. New analyses will use them.
          </Alert>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CardHead title="Estimation" subtitle="How expected returns and risk are estimated from history." />
          <div className="card-pad grid gap-4 sm:grid-cols-2">
            <Field label="Estimation window" htmlFor="lookback" hint="Longer is steadier; shorter adapts faster.">
              <Select id="lookback" value={String(form.lookback_days)} onChange={(v) => set("lookback_days", Number(v))} options={LOOKBACKS} />
            </Field>
            <Field label="Risk-free rate" htmlFor="rf" hint="Used in Sharpe, the capital market line and as the return on cash.">
              <NumberInput
                id="rf"
                value={Number((form.risk_free_rate * 100).toFixed(2))}
                onChange={(v) => set("risk_free_rate", (typeof v === "number" ? v : 0) / 100)}
                min={-5}
                max={25}
                step={0.1}
                suffix="%"
              />
            </Field>
            <Field label="Expected returns" htmlFor="rm" hint="Historical means are unbiased but very noisy.">
              <Select id="rm" value={form.return_method} onChange={(v) => set("return_method", v)} options={RETURN_METHODS} />
            </Field>
            <Field label="Covariance" htmlFor="cm" hint="Shrinkage stabilizes the matrix and usually the weights too.">
              <Select id="cm" value={form.cov_method} onChange={(v) => set("cov_method", v)} options={COV_METHODS} />
            </Field>
          </div>
          <div className="card-pad border-t border-hair">
            <HowCalculated>
              <p>
                The window is a count of trading days: 252 is one year, 756 is three. Expected returns and the covariance matrix
                are both estimated over exactly that window, on days where every selected asset traded.
              </p>
            </HowCalculated>
          </div>
        </Card>

        <Card>
          <CardHead title="Optimization defaults" subtitle="Where the Optimize page starts." />
          <div className="card-pad space-y-4">
            <Field label="Default objective" htmlFor="obj">
              <Select id="obj" value={form.default_objective} onChange={(v) => set("default_objective", v)} options={OBJECTIVES} />
            </Field>
            <Slider
              label="Default maximum weight per asset"
              display={pct(form.max_weight, 0)}
              min={0.05}
              max={1}
              step={0.05}
              value={form.max_weight}
              onChange={(v) => set("max_weight", v)}
            />
            <p className="-mt-2 text-xs text-ink-3">
              A cap below 1 ÷ (number of holdings) makes a fully invested portfolio impossible; the app raises it to the
              feasible minimum and tells you when that happens.
            </p>
          </div>
        </Card>

        <Card>
          <CardHead title="Risk reporting" subtitle="Confidence level for VaR and Expected Shortfall." />
          <div className="card-pad grid gap-4 sm:grid-cols-2">
            <Field label="Confidence level" htmlFor="conf" hint="95% reports the worst 1 day in 20; 99% the worst 1 in 100.">
              <Select id="conf" value={String(form.confidence)} onChange={(v) => set("confidence", Number(v))} options={CONFIDENCES} />
            </Field>
          </div>
        </Card>

        <Card>
          <CardHead title="Trading assumptions" subtitle="Used by rebalancing, what-if and the backtester." />
          <div className="card-pad space-y-4">
            <Slider
              label="Transaction cost per trade"
              display={`${(form.cost_rate * 100).toFixed(2)}%`}
              min={0}
              max={0.01}
              step={0.0005}
              value={form.cost_rate}
              onChange={(v) => set("cost_rate", v)}
            />
            <Slider
              label="Rebalance threshold"
              display={pct(form.rebalance_threshold, 0)}
              min={0}
              max={0.25}
              step={0.01}
              value={form.rebalance_threshold}
              onChange={(v) => set("rebalance_threshold", v)}
            />
            <p className="-mt-2 text-xs text-ink-3">
              A rebalance is only recommended once the largest drift exceeds this threshold, because every trade costs money.
            </p>
          </div>
        </Card>

        <Card>
          <CardHead title="Simulation defaults" subtitle="Starting point on the Monte Carlo page." />
          <div className="card-pad grid gap-4 sm:grid-cols-2">
            <Field label="Default horizon" htmlFor="mch">
              <Select id="mch" value={String(form.mc_horizon_days)} onChange={(v) => set("mc_horizon_days", Number(v))} options={MC_HORIZONS} />
            </Field>
            <Field label="Default simulations" htmlFor="mcs" hint="More simulations give smoother tails and take longer.">
              <NumberInput id="mcs" value={form.mc_sims} onChange={(v) => set("mc_sims", typeof v === "number" ? v : 1000)} min={100} max={20000} step={500} />
            </Field>
          </div>
        </Card>

        <Card>
          <CardHead title="Market data" subtitle="Where the prices behind every calculation come from." />
          <dl className="divide-y divide-line">
            {[
              ["Source", status ? `${status.source}${status.synthetic ? " (synthetic)" : ""}` : "…"],
              ["Coverage", status?.first_date ? `${status.first_date} → ${status.last_date}` : "…"],
              ["Assets", status ? String(status.assets) : "…"],
              ["Last refresh", status?.last_updated ?? "not yet run"],
            ].map(([k, v]) => (
              <div key={k} className="flex flex-wrap items-baseline gap-x-4 px-4 py-2.5 sm:px-5">
                <dt className="label min-w-[7rem]">{k}</dt>
                <dd className="num text-sm text-ink">{v}</dd>
              </div>
            ))}
          </dl>
          {status?.synthetic ? (
            <div className="card-pad border-t border-hair">
              <p className="text-xs text-ink-3">
                This deployment has no outbound access to a price provider, so prices come from a documented factor model with a
                fixed seed. The mathematics is unchanged; only the price series is simulated.
              </p>
            </div>
          ) : null}
        </Card>
      </div>

      <div className="mt-5">
        <Card>
          <CardHead title="Account" subtitle="Your password, sessions and account data live on the profile page." />
          <div className="card-pad">
            <p className="text-sm text-ink-2">
              Signed in as <span className="font-medium text-ink">{user?.email}</span>.
            </p>
            <div className="mt-3">
              <LinkButton href="/profile" variant="secondary" size="sm">
                Open profile and security
              </LinkButton>
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}
