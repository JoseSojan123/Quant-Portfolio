"use client";

import { ArrowRight, Check, ChevronRight, Database, LineChart, Lock, Scale, ShieldCheck, Shuffle, Sliders, Zap } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import useSWR from "swr";

import { Logo } from "@/components/layout/app-shell";
import { LiveCandles, LiveLine, TickerTape, useEased } from "@/components/marketing/motion";
import { Alert, Button, LinkButton } from "@/components/ui";
import { api, errorMessage, fetcher } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { dateTime } from "@/lib/format";
import type { DataStatus, User } from "@/lib/types";

const FEATURES = [
  {
    icon: Sliders,
    title: "Optimize under real constraints",
    body: "Minimum variance, maximum Sharpe, target return and risk parity, with position caps, sector caps, a cash floor and a turnover budget.",
    tint: "from-[#2b8bf2] to-[#0071e3]",
    span: "lg:col-span-2",
    visual: "frontier",
  },
  {
    icon: ShieldCheck,
    title: "See where risk really sits",
    body: "Risk contribution per holding, correlations, VaR and Expected Shortfall, drawdown and beta.",
    tint: "from-[#7c7af0] to-[#5e5ce6]",
    span: "",
    visual: "risk",
  },
  {
    icon: Shuffle,
    title: "Simulate thousands of futures",
    body: "Monte Carlo with normal, fat-tailed or bootstrapped returns, summarized as a fan of outcomes.",
    tint: "from-[#2fc1c9] to-[#0a9fb5]",
    span: "",
    visual: "fan",
  },
  {
    icon: LineChart,
    title: "Test the process, not the hindsight",
    body: "Walk-forward backtests that re-estimate at every rebalance, pay costs and never peek at the future.",
    tint: "from-[#30c48d] to-[#1a9a6c]",
    span: "lg:col-span-2",
    visual: "backtest",
  },
  {
    icon: Zap,
    title: "Stress it on purpose",
    body: "Market crashes, sector shocks, rate shocks and replays of 2020, 2022 and April 2025, holding by holding.",
    tint: "from-[#ff9f0a] to-[#f56a00]",
    span: "lg:col-span-2",
    visual: "stress",
  },
  {
    icon: Scale,
    title: "Rebalance with a plan",
    body: "Drift against your target, a threshold rule and an exact trade list in whole shares, with costs.",
    tint: "from-[#ff6482] to-[#e8395c]",
    span: "",
    visual: "trades",
  },
];

const FORMULAS = [
  { name: "Portfolio volatility", formula: "σₚ = √(wᵀ Σ w)", note: "Annualized with √252." },
  { name: "Risk contribution", formula: "RCᵢ = wᵢ (Σw)ᵢ / σₚ", note: "Sums exactly to σₚ." },
  { name: "Expected Shortfall", formula: "ES = E[ L | L ≥ VaRα ]", note: "Historical and parametric." },
  { name: "Sharpe ratio", formula: "S = (μₚ − r_f) / σₚ", note: "Risk-free rate you choose." },
  { name: "Ledoit–Wolf", formula: "Σ̂ = δF + (1 − δ) S", note: "Shrinks noisy covariance." },
  { name: "Turnover", formula: "τ = Σ | wᵢ⁺ − wᵢ |", note: "Charged at your cost rate." },
];

export default function LandingPage() {
  const router = useRouter();
  const { user, setUser } = useAuth();
  const { data: status } = useSWR<DataStatus>("/meta/data-status", fetcher);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startDemo() {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ user: User }>("/auth/demo", { method: "POST" });
      setUser(res.user);
      router.push("/dashboard");
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-white">
      <header className="glass sticky top-0 z-40 border-b">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2">
            <Logo />
            <span className="font-display text-[15px] font-semibold tracking-tighter2">Quant Portfolio</span>
          </Link>
          <nav className="ml-auto flex items-center gap-1 sm:gap-1.5">
            <Link href="/methodology" className="hidden rounded-full px-3 py-1.5 text-[13px] text-ink-2 transition hover:text-ink sm:block">
              Methodology
            </Link>
            <Link href="/about" className="hidden rounded-full px-3 py-1.5 text-[13px] text-ink-2 transition hover:text-ink sm:block">
              About
            </Link>
            {user ? (
              <LinkButton href="/dashboard" size="sm">
                Open dashboard
              </LinkButton>
            ) : (
              <>
                <Link href="/login" className="rounded-full px-3 py-1.5 text-[13px] text-ink-2 transition hover:text-ink">
                  Sign in
                </Link>
                <LinkButton href="/signup" size="sm">
                  Get started
                </LinkButton>
              </>
            )}
          </nav>
        </div>
      </header>

      <main id="main">
        {/* Hero */}
        <section className="relative isolate">
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[720px] overflow-hidden">
            <div className="absolute left-1/2 top-[-240px] h-[620px] w-[980px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(0,113,227,0.16),transparent)]" />
            <div className="absolute right-[-120px] top-[120px] h-[420px] w-[520px] rounded-full bg-[radial-gradient(closest-side,rgba(94,92,230,0.13),transparent)]" />
            <div className="absolute left-[-160px] top-[260px] h-[380px] w-[480px] rounded-full bg-[radial-gradient(closest-side,rgba(47,193,201,0.10),transparent)]" />
          </div>

          <div className="mx-auto w-full max-w-5xl px-4 pb-6 pt-16 text-center sm:px-6 sm:pt-24">
            <span className="inline-flex animate-rise items-center gap-1.5 rounded-full bg-white/80 px-3.5 py-1.5 text-xs font-medium text-ink-2 shadow-card backdrop-blur">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#30c48d] opacity-60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#30c48d]" />
              </span>
              {status?.synthetic ? "Live demo on reproducible market data" : `Market data: ${status?.source ?? "loading"}`}
            </span>

            <h1 className="mx-auto mt-6 max-w-4xl animate-rise font-display text-[42px] font-semibold leading-[1.04] tracking-tightest text-ink [animation-delay:60ms] sm:text-[64px] lg:text-[76px]">
              Your portfolio.
              <br />
              <span className="text-gradient">Measured like a risk desk.</span>
            </h1>

            <p className="mx-auto mt-6 max-w-2xl animate-rise text-[17px] leading-relaxed text-ink-2 [animation-delay:120ms] sm:text-[20px]">
              Enter what you own. Get risk decomposition, constrained optimization, stress tests, Monte Carlo and honest
              backtests, with every formula one tap away.
            </p>

            <div className="mt-9 flex animate-rise flex-wrap items-center justify-center gap-3 [animation-delay:180ms]">
              {user ? (
                <LinkButton href="/dashboard" className="shadow-glow">
                  Open dashboard <ArrowRight className="h-4 w-4" />
                </LinkButton>
              ) : (
                <>
                  <Button onClick={startDemo} loading={busy} className="shadow-glow">
                    Try the live demo
                  </Button>
                  <Link href="/signup" className="group inline-flex min-h-[42px] items-center gap-1 px-3 text-[15px] font-medium text-brand-600 sm:text-sm">
                    Create a free account
                    <ChevronRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                  </Link>
                </>
              )}
            </div>
            {error ? (
              <div className="mx-auto mt-4 max-w-md text-left">
                <Alert kind="error">{error}</Alert>
              </div>
            ) : null}
            <p className="mt-5 flex items-center justify-center gap-1.5 text-xs text-ink-3">
              <Lock className="h-3 w-3" />
              No brokerage connection, ever. You type in your holdings.
            </p>
          </div>

          <div className="mt-10 animate-fade border-y border-black/[0.05] bg-white/60 py-3 backdrop-blur [animation-delay:300ms]">
            <TickerTape className="mx-auto max-w-6xl px-4 sm:px-6" />
          </div>

          <div className="mx-auto w-full max-w-6xl animate-rise px-4 pb-20 pt-12 [animation-delay:260ms] sm:px-6 sm:pb-28">
            <ProductShot />
          </div>
        </section>

        {/* Features */}
        <section className="bg-page py-20 sm:py-28">
          <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
            <div className="mx-auto max-w-3xl text-center">
              <p className="eyebrow text-brand-600">What it does</p>
              <h2 className="mt-3 font-display text-[32px] font-semibold leading-tight tracking-tightest text-ink sm:text-[48px]">
                Everything a risk desk does.
                <span className="block text-ink-3">For your portfolio.</span>
              </h2>
            </div>
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5">
              {FEATURES.map((f) => (
                <article
                  key={f.title}
                  className={`group relative flex flex-col overflow-hidden rounded-3xl bg-white p-6 shadow-card transition duration-300 hover:-translate-y-0.5 hover:shadow-lift sm:p-7 ${f.span}`}
                >
                  <span className={`inline-flex h-11 w-11 items-center justify-center rounded-[13px] bg-gradient-to-br ${f.tint} text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_6px_16px_-6px_rgba(0,0,0,0.25)]`}>
                    <f.icon className="h-5 w-5" strokeWidth={2} />
                  </span>
                  <h3 className="mt-5 font-display text-[19px] font-semibold tracking-tighter2 text-ink">{f.title}</h3>
                  <p className="mt-2 max-w-md text-[15px] leading-relaxed text-ink-2">{f.body}</p>
                  {f.visual === "frontier" ? <FrontierVisual /> : null}
                  {f.visual === "risk" ? <RiskVisual /> : null}
                  {f.visual === "fan" ? <FanVisual /> : null}
                  {f.visual === "backtest" ? <BacktestVisual /> : null}
                  {f.visual === "stress" ? <StressVisual /> : null}
                  {f.visual === "trades" ? <TradesVisual /> : null}
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Mathematics */}
        <section className="relative isolate overflow-hidden bg-black py-20 text-white sm:py-28">
          <div aria-hidden className="pointer-events-none absolute left-1/2 top-0 -z-10 h-[520px] w-[1100px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(0,113,227,0.28),transparent)]" />
          <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
            <div className="max-w-3xl">
              <p className="eyebrow text-[#6cb4ff]">Transparent by design</p>
              <h2 className="mt-3 font-display text-[32px] font-semibold leading-tight tracking-tightest sm:text-[48px]">
                The mathematics is not hidden.
              </h2>
              <p className="mt-4 max-w-2xl text-[17px] leading-relaxed text-white/60">
                Every important number carries a &ldquo;How is this calculated?&rdquo; note, every page names its estimation window
                and estimators, and the methodology writes out each formula with the assumption it makes.
              </p>
            </div>
            <div className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {FORMULAS.map((f) => (
                <div key={f.name} className="rounded-3xl bg-white/[0.06] p-6 ring-1 ring-inset ring-white/10 backdrop-blur">
                  <p className="text-[13px] font-medium text-white/50">{f.name}</p>
                  <p className="mt-3 font-mono text-[20px] tracking-normal text-white">{f.formula}</p>
                  <p className="mt-3 text-[13px] text-white/45">{f.note}</p>
                </div>
              ))}
            </div>
            <Link href="/methodology" className="group mt-10 inline-flex items-center gap-1 text-[17px] font-medium text-[#6cb4ff] hover:text-[#8fc6ff]">
              Read the full methodology
              <ChevronRight className="h-5 w-5 transition group-hover:translate-x-0.5" />
            </Link>

            <div className="mt-16 overflow-hidden rounded-3xl bg-white/[0.04] p-5 ring-1 ring-inset ring-white/10 sm:p-7">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[13px] font-medium text-white/50">The data underneath</p>
                  <p className="mt-1 font-display text-[22px] font-semibold tracking-tighter2">Daily bars in, risk numbers out.</p>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-white/70">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#30d158]" />
                  Simulated feed
                </span>
              </div>
              <LiveCandles className="mt-6" height={240} count={56} />
              <TickerTape tone="dark" className="mt-5 border-t border-white/10 pt-4" />
            </div>
          </div>
        </section>

        {/* Built with restraint */}
        <section className="py-20 sm:py-28">
          <div className="mx-auto grid w-full max-w-6xl gap-5 px-4 sm:px-6 lg:grid-cols-2">
            <div className="rounded-3xl bg-page p-7 sm:p-9">
              <p className="eyebrow">How it is built</p>
              <h3 className="mt-3 font-display text-[26px] font-semibold leading-tight tracking-tightest text-ink">A real engine underneath.</h3>
              <ul className="mt-6 space-y-3 text-[15px] text-ink-2">
                {[
                  "Next.js, React and TypeScript on the front end",
                  "FastAPI with NumPy, pandas and SciPy behind it",
                  "PostgreSQL or SQLite for portfolios, prices and saved runs",
                  "A pure quant package you can import from a notebook",
                  "A validated market-data pipeline with an update log",
                  "Tested end to end: pytest, Vitest and a browser pass",
                ].map((s) => (
                  <li key={s} className="flex gap-3">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-600/10">
                      <Check className="h-3 w-3 text-brand-600" strokeWidth={3} />
                    </span>
                    {s}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-3xl bg-page p-7 sm:p-9">
              <p className="eyebrow">What it deliberately does not do</p>
              <h3 className="mt-3 font-display text-[26px] font-semibold leading-tight tracking-tightest text-ink">Honest about its limits.</h3>
              <ul className="mt-6 space-y-3 text-[15px] text-ink-2">
                {[
                  "No brokerage connection and no broker credentials, in any version.",
                  "No price prediction. Expected returns are noisy historical estimates.",
                  "No claim that Monte Carlo forecasts the market. It explores assumptions.",
                  "No investment advice. This is an educational engineering project.",
                ].map((s) => (
                  <li key={s} className="flex gap-3">
                    <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-ink-3" />
                    {s}
                  </li>
                ))}
              </ul>
              {status ? (
                <p className="mt-7 flex items-start gap-2 border-t border-black/[0.06] pt-5 text-xs leading-relaxed text-ink-3">
                  <Database className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    {status.synthetic
                      ? "This deployment runs on reproducible synthetic market data, so it works without a data vendor."
                      : `Market data from ${status.source}.`}{" "}
                    {status.assets} assets, {status.first_date} to {status.last_date}. Updated {dateTime(status.last_updated)}.
                  </span>
                </p>
              ) : null}
            </div>
          </div>
        </section>

        {/* Closing CTA */}
        <section className="bg-page py-20 sm:py-28">
          <div className="mx-auto w-full max-w-3xl px-4 text-center sm:px-6">
            <h2 className="font-display text-[34px] font-semibold leading-tight tracking-tightest text-ink sm:text-[52px]">
              Start with what you own.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-[17px] leading-relaxed text-ink-2">
              Add a few holdings with quantity and average cost. The platform does the rest in seconds.
            </p>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <LinkButton href={user ? "/dashboard" : "/signup"} className="shadow-glow">
                {user ? "Open dashboard" : "Create your account"}
              </LinkButton>
              {!user ? (
                <Button variant="secondary" onClick={startDemo} loading={busy}>
                  Explore the demo first
                </Button>
              ) : null}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-black/[0.06] bg-page">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-8 text-[13px] text-ink-2 sm:flex-row sm:items-center sm:px-6">
          <div className="flex items-center gap-2">
            <Logo className="h-6 w-6 rounded-[7px]" />
            <span className="font-medium text-ink">Quant Portfolio</span>
          </div>
          <nav className="flex flex-wrap gap-5 sm:ml-auto">
            <Link href="/methodology" className="hover:text-ink">
              Methodology
            </Link>
            <Link href="/about" className="hover:text-ink">
              About &amp; limitations
            </Link>
            <Link href="/login" className="hover:text-ink">
              Sign in
            </Link>
          </nav>
        </div>
        <p className="mx-auto w-full max-w-6xl px-4 pb-8 text-xs text-ink-3 sm:px-6">
          Educational project. Figures are estimates from historical data and are not investment advice.
        </p>
      </footer>
    </div>
  );
}

/* ------------------------------------------------------------------ illustrations */

/** A smooth, deterministic growth curve for the hero illustration (not real data). */
function curve(n: number, w: number, h: number, seed: number, drift: number): string {
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const y = 0.15 + drift * t + 0.06 * Math.sin(t * 9 + seed) + 0.035 * Math.sin(t * 23 + seed * 2) + 0.02 * Math.sin(t * 51 + seed);
    pts.push([t * w, h - y * h]);
  }
  return pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
}

function ProductShot() {
  // The headline number follows the live line: today's value scaled by the line's move.
  const [ratio, setRatio] = useState(1);
  const onValue = useCallback((v: number, first: number) => setRatio(v / first), []);
  const base = 49890 / 1.32;
  const value = useEased(base * Math.max(0.5, ratio));
  const gain = value - 37790;
  const bars = [
    { t: "NVDA", w: 0.22, r: 0.44 },
    { t: "AAPL", w: 0.15, r: 0.15 },
    { t: "MSFT", w: 0.14, r: 0.14 },
    { t: "JPM", w: 0.11, r: 0.1 },
    { t: "GLD", w: 0.09, r: 0.01 },
  ];
  return (
    <div className="relative">
      <div className="relative overflow-hidden rounded-[28px] bg-white p-2 shadow-lift ring-1 ring-black/[0.04] sm:p-3">
        <div className="rounded-[22px] bg-page p-4 sm:p-6">
          {/* window chrome */}
          <div className="mb-4 flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
            <span className="ml-3 hidden rounded-full bg-white px-3 py-0.5 text-[11px] text-ink-3 shadow-card sm:inline">quant-portfolio / dashboard</span>
          </div>

          <div className="grid gap-3 sm:gap-4 lg:grid-cols-[1.6fr_1fr]">
            <div className="rounded-2xl bg-white p-5 shadow-card">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="text-left">
                  <p className="text-[12px] font-medium text-ink-2">Portfolio value</p>
                  <p className="num mt-1 font-display text-[30px] font-semibold tracking-tightest text-ink sm:text-[36px]">
                    ${Math.round(value).toLocaleString("en-US")}
                  </p>
                  <p className={`num text-[13px] font-medium ${gain >= 0 ? "text-pos" : "text-neg"}`}>
                    {gain >= 0 ? "+" : "-"}${Math.abs(Math.round(gain)).toLocaleString("en-US")} · {gain >= 0 ? "+" : ""}
                    {((value / 37790 - 1) * 100).toFixed(1)}% total
                  </p>
                </div>
                <div className="flex gap-1 rounded-[10px] bg-black/[0.05] p-[3px] text-[11px] font-medium">
                  {["1Y", "3Y", "5Y"].map((p) => (
                    <span key={p} className={`rounded-[7px] px-2.5 py-1 ${p === "3Y" ? "bg-white text-ink shadow-thumb" : "text-ink-2"}`}>
                      {p}
                    </span>
                  ))}
                </div>
              </div>
              <LiveLine className="mt-4 h-[150px] sm:h-[190px]" onValue={onValue} />
            </div>

            <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-1">
              <div className="rounded-2xl bg-white p-5 text-left shadow-card">
                <p className="text-[12px] font-medium text-ink-2">Capital vs risk</p>
                <div className="mt-3 space-y-2.5">
                  {bars.map((b, i) => (
                    <div key={b.t} className="grid grid-cols-[44px_1fr] items-center gap-2">
                      <span className="text-[11px] font-medium text-ink-2">{b.t}</span>
                      <div className="space-y-1">
                        <div className="h-[5px] origin-left animate-grow rounded-full bg-[#2a78d6]" style={{ width: `${b.w * 200}%`, animationDelay: `${500 + i * 90}ms` }} />
                        <div className="h-[5px] origin-left animate-grow rounded-full bg-[#eb6834]" style={{ width: `${b.r * 200}%`, animationDelay: `${560 + i * 90}ms` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                {[
                  ["Sharpe", "1.31"],
                  ["Volatility", "20.6%"],
                  ["95% VaR", "1.9%"],
                  ["Max drawdown", "-18.0%"],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-2xl bg-white p-4 text-left shadow-card">
                    <p className="text-[11px] font-medium text-ink-2">{k}</p>
                    <p className="num mt-1 font-display text-[20px] font-semibold tracking-tighter2 text-ink">{v}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* floating chips */}
      <div className="absolute -left-2 top-[60%] hidden animate-float rounded-2xl bg-white/90 px-4 py-3 text-left shadow-pop backdrop-blur-xl md:block lg:-left-10">
        <p className="text-[11px] font-medium text-ink-3">Optimized Sharpe</p>
        <p className="num font-display text-[18px] font-semibold tracking-tighter2 text-ink">
          1.31 <span className="text-ink-3">→</span> <span className="text-pos">1.72</span>
        </p>
      </div>
      <div className="absolute -right-2 top-6 hidden animate-float rounded-2xl bg-white/90 px-4 py-3 text-left shadow-pop backdrop-blur-xl [animation-delay:-3s] md:block lg:-right-10">
        <p className="text-[11px] font-medium text-ink-3">Chance of a 10% loss</p>
        <p className="num font-display text-[18px] font-semibold tracking-tighter2 text-ink">2.8%</p>
      </div>
      <p className="mt-4 text-center text-xs text-ink-3">Illustration. The live demo shows these figures for a real sample portfolio.</p>
    </div>
  );
}

/** Small illustrative visuals for the feature tiles. They are drawings, not data. */
function VisualFrame({ children }: { children: React.ReactNode }) {
  return <div className="mt-auto pt-6">{children}</div>;
}

function FrontierVisual() {
  const frontier = Array.from({ length: 48 }, (_, i) => {
    const t = i / 47;
    return [40 + t * 340, 128 - Math.sqrt(t) * 104] as const;
  });
  // Deterministic scatter of feasible portfolios sitting below the frontier.
  let seed = 7;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const cloud = Array.from({ length: 110 }, () => {
    const x = 70 + rand() * 280;
    const edge = 128 - Math.sqrt((x - 40) / 340) * 104;
    return [x, Math.min(136, edge + 8 + rand() * rand() * 70)] as const;
  });
  return (
    <VisualFrame>
      <svg viewBox="0 0 420 150" className="h-[140px] w-full" aria-hidden>
        <line x1="20" y1="140" x2="410" y2="140" stroke="#e3e3e8" />
        {cloud.map(([x, y], i) => (
          <circle key={i} cx={x.toFixed(1)} cy={y.toFixed(1)} r="2.6" fill="#c7c7cc" opacity="0.8" />
        ))}
        <line x1="20" y1="122" x2="412" y2="4" stroke="#8e8e93" strokeDasharray="4 4" strokeWidth="1.2" />
        <path d={frontier.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ")} fill="none" stroke="#0071e3" strokeWidth="3" strokeLinecap="round" />
        <circle cx="245" cy="47" r="7" fill="#1baf7a" stroke="white" strokeWidth="3" />
        <circle cx="215" cy="84" r="7" fill="#eb6834" stroke="white" strokeWidth="3" />
      </svg>
    </VisualFrame>
  );
}

function RiskVisual() {
  const rows = [
    ["NVDA", 0.44],
    ["AAPL", 0.15],
    ["MSFT", 0.14],
    ["JPM", 0.1],
  ] as const;
  return (
    <VisualFrame>
      <div className="space-y-2.5">
        {rows.map(([t, r]) => (
          <div key={t} className="grid grid-cols-[40px_1fr] items-center gap-2">
            <span className="text-[11px] font-medium text-ink-3">{t}</span>
            <div className="h-2 rounded-full bg-black/[0.05]">
              <div className="h-2 rounded-full bg-gradient-to-r from-[#8e8cf2] to-[#5e5ce6]" style={{ width: `${r * 200}%` }} />
            </div>
          </div>
        ))}
      </div>
    </VisualFrame>
  );
}

function FanVisual() {
  const W = 300;
  const H = 110;
  const band = (k: number) => {
    const top = Array.from({ length: 30 }, (_, i) => [(i / 29) * W, H / 2 - (i / 29) * (8 + k * 34)] as const);
    const bot = Array.from({ length: 30 }, (_, i) => [((29 - i) / 29) * W, H / 2 + ((29 - i) / 29) * (k * 22) - ((29 - i) / 29) * 8] as const);
    return [...top, ...bot].map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ") + " Z";
  };
  return (
    <VisualFrame>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-[110px] w-full" preserveAspectRatio="none" aria-hidden>
        <path d={band(1.6)} fill="#0a9fb5" opacity="0.12" />
        <path d={band(0.8)} fill="#0a9fb5" opacity="0.2" />
        <path d={`M0,${H / 2} L${W},${H / 2 - 20}`} stroke="#0a9fb5" strokeWidth="2.5" fill="none" vectorEffect="non-scaling-stroke" />
        <line x1="0" x2={W} y1={H / 2} y2={H / 2} stroke="#8e8e93" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
      </svg>
    </VisualFrame>
  );
}

function BacktestVisual() {
  const W = 640;
  const H = 130;
  const lines = [
    { c: "#1baf7a", d: curve(80, W, H, 0.4, 0.62) },
    { c: "#2a78d6", d: curve(80, W, H, 1.7, 0.5) },
    { c: "#eda100", d: curve(80, W, H, 2.9, 0.36) },
  ];
  return (
    <VisualFrame>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-[130px] w-full" preserveAspectRatio="none" aria-hidden>
        {[0.33, 0.66].map((g) => (
          <line key={g} x1="0" x2={W} y1={H * g} y2={H * g} stroke="#efeff2" vectorEffect="non-scaling-stroke" />
        ))}
        {[0.25, 0.5, 0.75].map((x) => (
          <line key={x} x1={W * x} x2={W * x} y1="0" y2={H} stroke="#d1d1d6" strokeDasharray="2 5" vectorEffect="non-scaling-stroke" />
        ))}
        {lines.map((l) => (
          <path key={l.c} d={l.d} fill="none" stroke={l.c} strokeWidth="2.2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        ))}
      </svg>
      <p className="mt-2 text-[11px] text-ink-3">Dotted lines mark rebalance dates. Each one sees only the data before it.</p>
    </VisualFrame>
  );
}

function StressVisual() {
  const rows = [
    ["COVID crash", -0.353],
    ["Market −20%", -0.199],
    ["2022 bear market", -0.198],
    ["Tech sell-off", -0.143],
    ["Energy spike", 0.014],
  ] as const;
  return (
    <VisualFrame>
      <div className="space-y-2">
        {rows.map(([n, v]) => (
          <div key={n} className="grid grid-cols-[120px_1fr_52px] items-center gap-3">
            <span className="truncate text-[12px] text-ink-2">{n}</span>
            <div className="relative h-2.5">
              <div className="absolute inset-y-0 left-[78%] w-px bg-black/10" />
              <div
                className={`absolute inset-y-0 rounded-full ${v < 0 ? "bg-gradient-to-l from-[#ffb340] to-[#f56a00]" : "bg-[#1d7f3a]"}`}
                style={v < 0 ? { right: "22%", width: `${(-v / 0.4) * 78}%` } : { left: "78%", width: `${(v / 0.1) * 22}%` }}
              />
            </div>
            <span className={`num text-right text-[12px] font-medium ${v < 0 ? "text-neg" : "text-pos"}`}>
              {v > 0 ? "+" : ""}
              {(v * 100).toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </VisualFrame>
  );
}

function TradesVisual() {
  const rows = [
    ["Buy", "MSFT", "15 sh"],
    ["Buy", "GLD", "20 sh"],
    ["Sell", "AAPL", "29 sh"],
  ] as const;
  return (
    <VisualFrame>
      <div className="divide-y divide-black/[0.06] rounded-2xl bg-page px-4">
        {rows.map(([a, t, q]) => (
          <div key={t} className="flex items-center gap-3 py-2.5 text-[13px]">
            <span className={`w-9 font-medium ${a === "Buy" ? "text-pos" : "text-neg"}`}>{a}</span>
            <span className="font-medium text-ink">{t}</span>
            <span className="num ml-auto text-ink-2">{q}</span>
          </div>
        ))}
      </div>
    </VisualFrame>
  );
}
