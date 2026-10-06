"use client";

import { Database, GitBranch, Layers, Lock, Server, TriangleAlert } from "lucide-react";
import Link from "next/link";
import useSWR from "swr";

import { Alert, Card } from "@/components/ui";
import { fetcher } from "@/lib/api";
import { dateTime } from "@/lib/format";
import type { DataStatus } from "@/lib/types";

type AppMeta = { name: string; version: string; environment: string; repository: string | null; data_source: string };

const LAYERS = [
  {
    icon: Layers,
    title: "Frontend — Next.js 15, React 19, TypeScript",
    body: "App Router with a route group per audience: public pages, the auth flow, and the signed-in app. Tailwind for the design system, Recharts for charts, SWR for data fetching and cache invalidation. Every page is mobile-first and works down to a 360px viewport.",
  },
  {
    icon: Server,
    title: "API — FastAPI with pydantic v2",
    body: "One thin HTTP layer: validate the request, resolve which portfolio is being analysed, check ownership, call the engine, serialize the result. No finance logic lives here, which is why the engine can be tested without a web server.",
  },
  {
    icon: GitBranch,
    title: "Engine — a framework-free Python package",
    body: "quant/ holds returns, risk metrics, estimators, the SLSQP optimizer, Monte Carlo, stress scenarios, rebalancing and the walk-forward backtester. It imports NumPy, pandas and SciPy and nothing from the web stack, so the same code runs in the API, in the tests and in a notebook.",
  },
  {
    icon: Database,
    title: "Data — PostgreSQL or SQLite, refreshed by a job",
    body: "Assets, daily prices, daily returns, portfolios, holdings, optimization runs, saved scenarios and an audit row per data update. A scheduled job fetches prices, validates them, upserts, and recomputes returns. The app reads from the database, never from a provider at request time.",
  },
];

const DECISIONS = [
  [
    "Manual holdings only",
    "You type ticker, quantity and average cost. The app never asks for brokerage credentials and has no brokerage integration, by design. Current prices come from the data pipeline, so the only thing you supply is what you own and what you paid.",
  ],
  [
    "Own auth rather than a hosted identity provider",
    "Email and password with bcrypt, a signed JWT in an httpOnly cookie, a token version that invalidates every existing session on password change, and one-time email verification and reset tokens tied to the current password hash. It runs with no third-party account, which keeps the project self-contained.",
  ],
  [
    "SQLite by default, PostgreSQL when configured",
    "Set DATABASE_URL to a Postgres or Supabase connection string and the same models and dialect-aware upserts run against it. SQLite with a file on disk means the app starts with one command on a laptop.",
  ],
  [
    "Estimation settings are visible, not hidden",
    "Every analytics page shows the window, the expected-return estimator, the covariance estimator and the risk-free rate used to produce the numbers on screen, because changing any of them changes the answer.",
  ],
];

const LIMITS = [
  "Expected returns are estimated from history and are the noisiest input in the model. Optimizing hard against them is how backtests get overfitted.",
  "The covariance matrix is assumed stable over the horizon. In a crisis, correlations converge towards one and diversification delivers less than the matrix implied.",
  "Risk is measured as volatility and tail quantiles. Permanent capital loss, illiquidity and leverage are not captured by either.",
  "Taxes, market impact, spreads beyond the flat cost rate, dividend timing and currency effects are out of scope.",
  "Backtests assume you trade at the close on the rebalance date. Real fills are worse.",
  "This is an analysis and educational tool. It is not investment advice, and it does not place trades.",
];

export default function AboutPage() {
  const { data: meta } = useSWR<AppMeta>("/meta/app", fetcher);
  const { data: status } = useSWR<DataStatus>("/meta/data-status", fetcher);

  return (
    <div className="space-y-10">
      <header>
        <p className="eyebrow text-brand-600">About</p>
        <h1 className="mt-2 font-display text-[34px] font-semibold leading-[1.08] tracking-tightest text-ink sm:text-[48px]">A portfolio construction and risk platform, built in the open</h1>
        <p className="mt-3 max-w-2xl text-ink-2">
          You enter what you own. The platform values it, measures where its risk actually sits, optimizes it under
          constraints you can see, stresses it, simulates it, and tests the whole process on history without letting it peek at
          the future. Each number carries an explanation of how it was produced, and the{" "}
          <Link href="/methodology" className="font-medium text-brand-700 underline decoration-brand-200 underline-offset-2 hover:decoration-brand-600">
            methodology page
          </Link>{" "}
          writes out every formula.
        </p>
      </header>

      <section>
        <h2 className="font-display text-[24px] font-semibold tracking-tightest text-ink sm:text-[28px]">Architecture</h2>
        <p className="mt-2 max-w-2xl text-sm text-ink-2">
          Browser → Next.js frontend → FastAPI → the quant engine → the price database. The frontend proxies{" "}
          <code className="rounded-md bg-black/[0.045] px-1.5 py-0.5">/api/*</code> to the backend so the session cookie stays first-party and no
          token is ever stored in JavaScript.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {LAYERS.map((l) => (
            <Card key={l.title} className="card-pad">
              <l.icon className="h-5 w-5 text-brand-600" aria-hidden />
              <h3 className="mt-2.5 text-sm font-semibold text-ink">{l.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{l.body}</p>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <h2 className="font-display text-[24px] font-semibold tracking-tightest text-ink sm:text-[28px]">Decisions worth stating</h2>
        <div className="mt-4 space-y-4">
          {DECISIONS.map(([title, body]) => (
            <Card key={title} className="card-pad">
              <h3 className="text-sm font-semibold text-ink">{title}</h3>
              <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-2">{body}</p>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <h2 className="font-display text-[24px] font-semibold tracking-tightest text-ink sm:text-[28px]">Security</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Card className="card-pad">
            <Lock className="h-5 w-5 text-brand-600" aria-hidden />
            <h3 className="mt-2.5 text-sm font-semibold text-ink">What the app holds</h3>
            <ul className="mt-1.5 space-y-1.5 text-sm text-ink-2">
              <li>Your email, a bcrypt hash of your password, and your holdings.</li>
              <li>Nothing that could be used to trade on your behalf.</li>
              <li>No brokerage credentials, ever — there is no field to enter them.</li>
            </ul>
          </Card>
          <Card className="card-pad">
            <Lock className="h-5 w-5 text-brand-600" aria-hidden />
            <h3 className="mt-2.5 text-sm font-semibold text-ink">How requests are protected</h3>
            <ul className="mt-1.5 space-y-1.5 text-sm text-ink-2">
              <li>Session JWT in an httpOnly, SameSite cookie; Secure in production.</li>
              <li>A cookie-authenticated write from an origin we do not recognize is rejected.</li>
              <li>Rate limits on auth and on the expensive analytics endpoints.</li>
              <li>Every request scoped to the signed-in user; another user&apos;s portfolio returns 404, not 403, so its existence is never confirmed.</li>
              <li>Secrets come from the environment. None are committed.</li>
            </ul>
          </Card>
        </div>
      </section>

      <section>
        <h2 className="flex items-center gap-2 font-display text-[24px] font-semibold tracking-tightest text-ink sm:text-[28px]">
          <TriangleAlert className="h-5 w-5 text-warn" aria-hidden />
          Known limitations
        </h2>
        <ul className="mt-4 max-w-2xl space-y-2">
          {LIMITS.map((t) => (
            <li key={t} className="flex gap-2.5 text-sm leading-relaxed text-ink-2">
              <span aria-hidden className="mt-[0.45rem] h-1.5 w-1.5 shrink-0 rounded-full bg-warn" />
              <span>{t}</span>
            </li>
          ))}
        </ul>
      </section>

      {status?.synthetic ? (
        <Alert kind="warning" title="Market data in this deployment is synthetic">
          Prices are generated by a documented factor model with a fixed seed, because this environment has no outbound access
          to a market-data provider. The series is realistic in structure — sector factors, a market factor, rate and oil
          sensitivities, fat-tailed daily noise, and real historical drawdown episodes — but it is not real market history, so
          no figure on the site is a statement about a real company. Every formula runs exactly as documented, and setting{" "}
          <code className="rounded-md bg-black/[0.045] px-1.5 py-0.5">DATA_SOURCE=yahoo</code> switches the same pipeline to live adjusted closes.
        </Alert>
      ) : null}

      <section>
        <h2 className="font-display text-[24px] font-semibold tracking-tightest text-ink sm:text-[28px]">This deployment</h2>
        <Card className="mt-4">
          <dl className="divide-y divide-line">
            {[
              ["Version", meta ? `${meta.name} ${meta.version}` : "…"],
              ["Environment", meta?.environment ?? "…"],
              ["Data source", status ? `${status.source}${status.synthetic ? " (synthetic)" : ""}` : "…"],
              ["Price history", status?.first_date ? `${status.first_date} → ${status.last_date}` : "…"],
              ["Assets covered", status ? String(status.assets) : "…"],
              ["Last data refresh", status?.last_updated ? dateTime(status.last_updated) : "not yet run"],
              ["Last job status", status?.last_run ? `${status.last_run.status}${status.last_run.message ? ` — ${status.last_run.message}` : ""}` : "no job has run"],
            ].map(([k, v]) => (
              <div key={k} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-5 py-3.5 sm:px-6">
                <dt className="label min-w-[9rem]">{k}</dt>
                <dd className="num text-sm text-ink">{v}</dd>
              </div>
            ))}
          </dl>
        </Card>
        {meta?.repository ? (
          <p className="mt-3 text-sm text-ink-2">
            Source:{" "}
            <a href={meta.repository} className="font-medium text-brand-700 underline decoration-brand-200 underline-offset-2 hover:decoration-brand-600">
              {meta.repository}
            </a>
          </p>
        ) : null}
      </section>
    </div>
  );
}
