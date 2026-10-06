"use client";

import { ArrowRight, Check, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";

import { HoldingForm, type HoldingDraft } from "@/components/portfolio/holding-form";
import { Alert, Button, Card, CardHead, Field, Spinner } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { money, qty } from "@/lib/format";
import { usePortfolios } from "@/lib/portfolio-context";
import type { Asset, PortfolioDetail } from "@/lib/types";

const STARTERS: { name: string; blurb: string; holdings: HoldingDraft[] }[] = [
  {
    name: "Balanced starter",
    blurb: "Five large caps across technology, financials and energy — the blueprint's example universe.",
    holdings: [
      { ticker: "AAPL", quantity: 10, average_cost: 190 },
      { ticker: "MSFT", quantity: 5, average_cost: 420 },
      { ticker: "NVDA", quantity: 8, average_cost: 120 },
      { ticker: "JPM", quantity: 10, average_cost: 210 },
      { ticker: "XOM", quantity: 20, average_cost: 105 },
    ],
  },
  {
    name: "Diversified across asset types",
    blurb: "Equities plus bonds and gold, so correlation and risk contribution have something to show.",
    holdings: [
      { ticker: "SPY", quantity: 10, average_cost: 560 },
      { ticker: "QQQ", quantity: 6, average_cost: 480 },
      { ticker: "TLT", quantity: 30, average_cost: 95 },
      { ticker: "GLD", quantity: 10, average_cost: 240 },
      { ticker: "JNJ", quantity: 12, average_cost: 160 },
    ],
  },
];

export default function OnboardingPage() {
  const router = useRouter();
  const { refresh } = useAuth();
  const { reload, setActiveId } = usePortfolios();
  const { data: assets } = useSWR<Asset[]>("/assets");

  const [name, setName] = useState("My portfolio");
  const [rows, setRows] = useState<HoldingDraft[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!assets) return <Spinner label="Loading the asset universe" />;

  const priceOf = (t: string) => assets.find((a) => a.ticker === t)?.last_price ?? null;
  const invested = rows.reduce((s, r) => s + r.quantity * r.average_cost, 0);
  const current = rows.reduce((s, r) => s + r.quantity * (priceOf(r.ticker) ?? r.average_cost), 0);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const p = await api<PortfolioDetail>("/portfolios", {
        body: { name: name.trim() || "My portfolio", holdings: rows, make_default: true },
      });
      await refresh();
      reload();
      setActiveId(p.id);
      router.push("/dashboard");
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-5">
        <p className="text-xs font-medium uppercase tracking-wide text-brand-600">Step 1 of 1</p>
        <h1 className="mt-1 font-display text-[28px] font-semibold leading-tight tracking-tightest text-ink sm:text-[34px]">Create your first portfolio</h1>
        <p className="mt-1.5 text-sm text-ink-2">
          Add what you own: ticker, how many units, and your average buy price. The platform fetches market prices itself, so
          your cost basis stays yours and the valuation stays current.
        </p>
      </div>

      {error ? (
        <div className="mb-4">
          <Alert kind="error">{error}</Alert>
        </div>
      ) : null}

      <Card className="mb-4">
        <div className="card-pad">
          <Field label="Portfolio name" htmlFor="pname">
            <input id="pname" value={name} onChange={(e) => setName(e.target.value)} className="input" maxLength={120} />
          </Field>
        </div>
      </Card>

      <Card className="mb-4">
        <CardHead title="Add holdings" subtitle="You can add, edit or remove holdings at any time." />
        <div className="card-pad">
          <HoldingForm assets={assets} existing={rows.map((r) => r.ticker)} onAdd={(h) => setRows((prev) => [...prev, h])} />
        </div>
      </Card>

      {rows.length > 0 ? (
        <Card className="mb-4">
          <CardHead
            title={`${rows.length} holding${rows.length === 1 ? "" : "s"}`}
            right={
              <span className="num text-xs text-ink-2">
                Invested {money(invested)} · current {money(current)}
              </span>
            }
          />
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th scope="col">Ticker</th>
                  <th scope="col" className="text-right">Quantity</th>
                  <th scope="col" className="text-right">Avg cost</th>
                  <th scope="col" className="text-right">Market price</th>
                  <th scope="col" className="text-right">Value</th>
                  <th scope="col" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.ticker}>
                    <td className="font-medium">{r.ticker}</td>
                    <td className="num text-right">{qty(r.quantity)}</td>
                    <td className="num text-right">{money(r.average_cost, { cents: true })}</td>
                    <td className="num text-right">{money(priceOf(r.ticker), { cents: true })}</td>
                    <td className="num text-right">{money(r.quantity * (priceOf(r.ticker) ?? r.average_cost))}</td>
                    <td className="text-right">
                      <button
                        onClick={() => setRows((prev) => prev.filter((_, j) => j !== i))}
                        aria-label={`Remove ${r.ticker}`}
                        className="rounded-full p-1.5 text-ink-3 hover:bg-neg-soft hover:text-neg"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <Card className="mb-4">
          <CardHead title="Not sure what to enter?" subtitle="Start from a sample portfolio and edit it afterwards." />
          <div className="card-pad grid gap-3 sm:grid-cols-2">
            {STARTERS.map((s) => (
              <button
                key={s.name}
                onClick={() => setRows(s.holdings)}
                className="rounded-2xl border border-hair p-3.5 text-left transition hover:border-brand-200 hover:bg-brand-50/40"
              >
                <p className="text-sm font-semibold text-ink">{s.name}</p>
                <p className="mt-1 text-xs leading-relaxed text-ink-2">{s.blurb}</p>
                <p className="mt-2 text-xs font-medium text-brand-600">{s.holdings.map((h) => h.ticker).join(" · ")}</p>
              </button>
            ))}
          </div>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={create} loading={busy} disabled={rows.length === 0}>
          Create portfolio and open dashboard <ArrowRight className="h-4 w-4" />
        </Button>
        {rows.length === 0 ? <p className="text-xs text-ink-3">Add at least one holding to continue.</p> : null}
      </div>

      <ul className="mt-6 space-y-1.5 text-xs text-ink-3">
        {[
          "Your holdings are private to your account and are never shared.",
          "We never ask for brokerage credentials — there is no broker connection in this product.",
          "Average buy price is only used for invested value and unrealized P&L; risk uses market prices.",
        ].map((t) => (
          <li key={t} className="flex gap-1.5">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-pos" />
            {t}
          </li>
        ))}
      </ul>
    </div>
  );
}
