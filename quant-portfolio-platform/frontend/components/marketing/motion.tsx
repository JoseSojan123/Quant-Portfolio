"use client";

/**
 * Market-themed motion for the public pages: a scrolling ticker tape, a live
 * candlestick chart and a live line chart.
 *
 * Everything here is driven by a seeded random walk, not market data, and says so
 * on screen ("Demo feed"). The first render is deterministic so server and client
 * markup match; the walk only starts ticking after mount, and never starts when
 * the visitor has asked for reduced motion.
 */

import clsx from "clsx";
import { useEffect, useMemo, useRef, useState } from "react";

/* ------------------------------------------------------------------ utilities */

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal draw (Box-Muller) from a uniform source. */
function gauss(rand: () => number): number {
  const u = Math.max(rand(), 1e-9);
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

/** Calls `fn` every `ms` after mount, unless reduced motion is requested. */
function useTick(fn: () => void, ms: number) {
  const reduced = useReducedMotion();
  const saved = useRef(fn);
  saved.current = fn;
  useEffect(() => {
    if (reduced) return;
    const id = window.setInterval(() => saved.current(), ms);
    return () => window.clearInterval(id);
  }, [ms, reduced]);
}

/* ---------------------------------------------------------------- ticker tape */

const TAPE: [string, number][] = [
  ["SPY", 668.2],
  ["AAPL", 255.0],
  ["MSFT", 510.0],
  ["NVDA", 180.0],
  ["GOOGL", 245.0],
  ["AMZN", 228.4],
  ["META", 742.1],
  ["JPM", 305.0],
  ["V", 348.6],
  ["XOM", 113.0],
  ["JNJ", 180.0],
  ["GLD", 355.0],
  ["TLT", 89.0],
  ["QQQ", 602.3],
];

type Quote = { sym: string; open: number; px: number; dir: 1 | -1 | 0; n: number };

/** Endless scrolling quote strip. Prices drift on a random walk; a changed price flashes. */
export function TickerTape({ tone = "light", className }: { tone?: "light" | "dark"; className?: string }) {
  const rand = useMemo(() => mulberry32(42), []);
  const [quotes, setQuotes] = useState<Quote[]>(() => {
    const r = mulberry32(7);
    return TAPE.map(([sym, px]) => {
      const open = px * (1 + (r() - 0.5) * 0.03);
      return { sym, open, px, dir: 0, n: 0 };
    });
  });

  useTick(() => {
    setQuotes((qs) =>
      qs.map((q) => {
        if (rand() > 0.35) return q;
        const px = Math.max(1, q.px * (1 + gauss(rand) * 0.0016));
        return { ...q, px, dir: px >= q.px ? 1 : -1, n: q.n + 1 };
      }),
    );
  }, 1400);

  const dark = tone === "dark";
  const row = (copy: number) => (
    <ul className="flex shrink-0 items-center gap-8 pr-8" aria-hidden={copy > 0}>
      {quotes.map((q) => {
        const chg = q.px / q.open - 1;
        const up = chg >= 0;
        return (
          <li key={`${copy}-${q.sym}`} className="flex items-center gap-2 whitespace-nowrap text-[13px]">
            <span className={clsx("font-semibold", dark ? "text-white" : "text-ink")}>{q.sym}</span>
            <span
              key={q.n}
              className={clsx(
                "num rounded-md px-1 tabular-nums",
                dark ? "text-white/80" : "text-ink-2",
                q.dir === 1 && (dark ? "animate-flash-up-dark" : "animate-flash-up"),
                q.dir === -1 && (dark ? "animate-flash-down-dark" : "animate-flash-down"),
              )}
            >
              {q.px.toFixed(2)}
            </span>
            <span
              className={clsx(
                "num text-[12px] font-medium tabular-nums",
                up ? (dark ? "text-[#30d158]" : "text-pos") : dark ? "text-[#ff6961]" : "text-neg",
              )}
            >
              {up ? "▲" : "▼"} {Math.abs(chg * 100).toFixed(2)}%
            </span>
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className={clsx("group relative flex items-center overflow-hidden", className)} aria-label="Demo price feed, simulated">
      <span
        className={clsx(
          "relative z-10 mr-2 hidden shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.06em] sm:inline-flex",
          dark ? "bg-white/10 text-white/70" : "bg-black/[0.045] text-ink-3",
        )}
      >
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#30c48d] opacity-70" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#30c48d]" />
        </span>
        Demo feed
      </span>
      <div
        className="relative min-w-0 flex-1 overflow-hidden"
        style={{ maskImage: "linear-gradient(to right, transparent, black 14%, black 92%, transparent)", WebkitMaskImage: "linear-gradient(to right, transparent, black 14%, black 92%, transparent)" }}
      >
        <div className="flex w-max animate-marquee group-hover:[animation-play-state:paused]">
          {row(0)}
          {row(1)}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ live candles */

type Candle = { o: number; h: number; l: number; c: number };

function nextCandle(prev: number, rand: () => number): Candle {
  const o = prev;
  const c = o * (1 + gauss(rand) * 0.011 + 0.0012);
  const h = Math.max(o, c) * (1 + Math.abs(gauss(rand)) * 0.004);
  const l = Math.min(o, c) * (1 - Math.abs(gauss(rand)) * 0.004);
  return { o, h, l, c };
}

/**
 * Candlestick chart that keeps printing: the last candle forms over a few ticks,
 * then a new one opens. A moving average and a last-price marker ride along.
 */
export function LiveCandles({
  count = 42,
  tone = "dark",
  className,
  height = 260,
}: {
  count?: number;
  tone?: "dark" | "light";
  className?: string;
  height?: number;
}) {
  const rand = useMemo(() => mulberry32(2024), []);
  const [candles, setCandles] = useState<Candle[]>(() => {
    const r = mulberry32(11);
    const out: Candle[] = [];
    let p = 100;
    for (let i = 0; i < count; i++) {
      const c = nextCandle(p, r);
      out.push(c);
      p = c.c;
    }
    return out;
  });
  const step = useRef(0);

  useTick(() => {
    step.current += 1;
    setCandles((cs) => {
      const last = cs[cs.length - 1];
      if (step.current % 4 === 0) {
        // Open a fresh candle at the last close; it takes shape over the next ticks.
        const p = last.c;
        return [...cs.slice(1), { o: p, h: p, l: p, c: p }];
      }
      // The forming candle wiggles before it closes.
      const c = last.c * (1 + gauss(rand) * 0.0055 + 0.0005);
      const wick = 1 + Math.abs(gauss(rand)) * 0.0015;
      const formed = { o: last.o, c, h: Math.max(last.h, c * wick), l: Math.min(last.l, c / wick) };
      return [...cs.slice(0, -1), formed];
    });
  }, 520);

  // Draw in real pixels (measured width) so the price pill and rounded corners never stretch.
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(600);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(240, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = height;
  const padR = 64;
  const lo = Math.min(...candles.map((c) => c.l));
  const hi = Math.max(...candles.map((c) => c.h));
  const span = hi - lo || 1;
  const y = (v: number) => 14 + (1 - (v - lo) / span) * (H - 28);
  const slot = (W - padR) / candles.length;
  const bw = Math.max(3, Math.min(14, slot * 0.58));

  const ma: string[] = [];
  candles.forEach((_, i) => {
    if (i < 7) return;
    const avg = candles.slice(i - 7, i + 1).reduce((s, c) => s + c.c, 0) / 8;
    ma.push(`${ma.length ? "L" : "M"}${(i * slot + slot / 2).toFixed(1)},${y(avg).toFixed(1)}`);
  });

  const dark = tone === "dark";
  const up = dark ? "#30d158" : "#1d7f3a";
  const down = dark ? "#ff453a" : "#d70015";
  const last = candles[candles.length - 1];
  const lastUp = last.c >= last.o;

  return (
    <div ref={box} className={clsx("w-full", className)} style={{ height }}>
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block" role="img" aria-label="Animated candlestick chart, simulated prices">
      <defs>
        <linearGradient id={`ma-${tone}`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor={dark ? "#6cb4ff" : "#0071e3"} stopOpacity="0.1" />
          <stop offset="100%" stopColor={dark ? "#6cb4ff" : "#0071e3"} stopOpacity="1" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((g) => (
        <line key={g} x1="0" x2={W - padR} y1={H * g} y2={H * g} stroke={dark ? "rgba(255,255,255,0.07)" : "#efeff2"} vectorEffect="non-scaling-stroke" />
      ))}
      {candles.map((c, i) => {
        const x = i * slot + slot / 2;
        const isUp = c.c >= c.o;
        const top = y(Math.max(c.o, c.c));
        const bot = y(Math.min(c.o, c.c));
        const fade = 0.35 + 0.65 * (i / (candles.length - 1));
        return (
          <g key={i} opacity={fade} style={{ transition: "opacity 0.4s" }}>
            <line x1={x} x2={x} y1={y(c.h)} y2={y(c.l)} stroke={isUp ? up : down} strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
            <rect x={x - bw / 2} y={top} width={bw} height={Math.max(1.5, bot - top)} rx="1.5" fill={isUp ? up : down} />
          </g>
        );
      })}
      <path d={ma.join(" ")} fill="none" stroke={`url(#ma-${tone})`} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      <line x1="0" x2={W - padR + 4} y1={y(last.c)} y2={y(last.c)} stroke={lastUp ? up : down} strokeDasharray="3 4" strokeOpacity="0.7" vectorEffect="non-scaling-stroke" />
      <g transform={`translate(${W - padR + 8}, ${y(last.c) - 11})`}>
        <rect width={padR - 10} height="22" rx="11" fill={lastUp ? up : down} />
        <text x={(padR - 10) / 2} y="15" textAnchor="middle" fontSize="12" fontWeight="600" fill="#fff" style={{ fontVariantNumeric: "tabular-nums" }}>
          {last.c.toFixed(2)}
        </text>
      </g>
    </svg>
    </div>
  );
}

/* ---------------------------------------------------------------- live line */

/**
 * A line that draws itself in on load and then keeps extending to the right.
 * Returns the latest value through `onValue` so a headline number can tick with it.
 */
export function LiveLine({
  points = 90,
  className,
  height,
  onValue,
}: {
  points?: number;
  className?: string;
  height?: number;
  onValue?: (v: number, first: number) => void;
}) {
  const rand = useMemo(() => mulberry32(99), []);
  const [series, setSeries] = useState<number[]>(() => {
    const r = mulberry32(5);
    const out: number[] = [];
    let v = 100;
    for (let i = 0; i < points; i++) {
      v *= 1 + gauss(r) * 0.009 + 0.0032;
      out.push(v);
    }
    return out;
  });
  const bench = useMemo(() => {
    const r = mulberry32(17);
    const out: number[] = [];
    let v = 100;
    for (let i = 0; i < points + 400; i++) {
      v *= 1 + gauss(r) * 0.007 + 0.0022;
      out.push(v);
    }
    return out;
  }, [points]);
  const [tick, setTick] = useState(0);

  useTick(() => {
    setTick((t) => t + 1);
    setSeries((s) => [...s.slice(1), s[s.length - 1] * (1 + gauss(rand) * 0.009 + 0.0028)]);
  }, 1100);

  useEffect(() => {
    onValue?.(series[series.length - 1], series[0]);
  }, [series, onValue]);

  const W = 640;
  const H = 200;
  const b = bench.slice(tick % 400, (tick % 400) + points);
  const all = [...series, ...b];
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const span = hi - lo || 1;
  const toPath = (arr: number[]) => arr.map((v, i) => `${i ? "L" : "M"}${((i / (arr.length - 1)) * W).toFixed(1)},${(8 + (1 - (v - lo) / span) * (H - 16)).toFixed(1)}`).join(" ");
  const main = toPath(series);
  const lastY = 8 + (1 - (series[series.length - 1] - lo) / span) * (H - 16);

  return (
    <div className={clsx("relative", className)} style={height ? { height } : undefined}>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" preserveAspectRatio="none" aria-hidden>
        <defs>
          <linearGradient id="live-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#0071e3" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#0071e3" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((g) => (
          <line key={g} x1="0" x2={W} y1={H * g} y2={H * g} stroke="#efeff2" vectorEffect="non-scaling-stroke" />
        ))}
        <path d={`${main} L${W},${H} L0,${H} Z`} fill="url(#live-fill)" className="animate-fade [animation-delay:600ms] [animation-duration:900ms]" />
        <path d={toPath(b)} fill="none" stroke="#8e8e93" strokeWidth="1.6" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
        <path d={main} pathLength={1} fill="none" stroke="#0071e3" strokeWidth="2.4" strokeLinejoin="round" vectorEffect="non-scaling-stroke" className="animate-draw" />
      </svg>
      {/* Pulsing "now" dot at the end of the line; HTML so it stays round when the SVG stretches. */}
      <span className="absolute right-0 h-0 w-0" style={{ top: `${(lastY / H) * 100}%`, transition: "top 0.6s cubic-bezier(0.22,1,0.36,1)" }}>
        <span className="absolute -left-[5px] -top-[5px] h-2.5 w-2.5 rounded-full bg-brand-600 ring-[3px] ring-white" />
        <span className="absolute -left-[11px] -top-[11px] h-[22px] w-[22px] animate-ping rounded-full bg-brand-600/30" />
      </span>
    </div>
  );
}

/** Number that eases toward its target instead of jumping. */
export function useEased(target: number, ms = 600): number {
  const [v, setV] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const frame = (t: number) => {
      const k = Math.min(1, (t - start) / ms);
      const e = 1 - Math.pow(1 - k, 3);
      const cur = a + (target - a) * e;
      setV(cur);
      from.current = cur;
      if (k < 1) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

/* ------------------------------------------------------------ auth side panel */

/** Dark "trading desk" panel shown beside the login and sign-up forms on wide screens. */
export function AuthMarketPanel() {
  const rand = useMemo(() => mulberry32(41), []);
  const [kpi, setKpi] = useState({ value: 128_460, sharpe: 1.24, vol: 13.8, n: 0 });
  useTick(() => {
    setKpi((k) => ({
      value: k.value * (1 + gauss(rand) * 0.0016 + 0.0002),
      sharpe: Math.min(1.6, Math.max(0.9, k.sharpe + gauss(rand) * 0.012)),
      vol: Math.min(17, Math.max(11, k.vol + gauss(rand) * 0.08)),
      n: k.n + 1,
    }));
  }, 1600);
  const value = useEased(kpi.value, 900);
  const gain = value / 118_920 - 1;

  return (
    <div className="relative isolate flex h-full min-h-[640px] flex-col overflow-hidden rounded-[32px] bg-[#05070d] p-8 text-white shadow-lift xl:p-10">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -left-24 -top-32 h-[420px] w-[520px] animate-glow rounded-full bg-[radial-gradient(closest-side,rgba(0,113,227,0.45),transparent)]" />
        <div className="absolute -bottom-40 -right-24 h-[420px] w-[520px] animate-glow rounded-full bg-[radial-gradient(closest-side,rgba(94,92,230,0.35),transparent)] [animation-delay:-4s]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:radial-gradient(ellipse_at_center,black_40%,transparent_80%)]" />
      </div>

      <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-white/75 ring-1 ring-inset ring-white/10">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#30d158] opacity-75" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#30d158]" />
        </span>
        Markets · simulated feed
      </span>
      <h2 className="mt-6 max-w-md font-display text-[34px] font-semibold leading-[1.08] tracking-tightest xl:text-[40px]">
        Every position, <span className="bg-gradient-to-r from-[#6cb4ff] to-[#a5a3ff] bg-clip-text text-transparent">measured.</span>
      </h2>
      <p className="mt-3 max-w-sm text-[15px] leading-relaxed text-white/60">
        Optimize, stress-test and rebalance with the same math the desks use, explained in plain language.
      </p>

      <div className="mt-auto pt-8">
        <div className="flex flex-wrap items-stretch gap-3">
          <div className="animate-float rounded-2xl bg-white/[0.08] px-4 py-3 ring-1 ring-inset ring-white/15 backdrop-blur-xl">
            <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-white/50">Portfolio value</p>
            <p className="mt-0.5 font-display text-[24px] font-semibold tabular-nums tracking-tighter2">${Math.round(value).toLocaleString("en-US")}</p>
            <p className={clsx("text-[12px] font-semibold tabular-nums", gain >= 0 ? "text-[#30d158]" : "text-[#ff6961]")}>
              {gain >= 0 ? "▲" : "▼"} {(Math.abs(gain) * 100).toFixed(2)}% all time
            </p>
          </div>
          <div className="flex animate-float items-center gap-5 rounded-2xl bg-white/[0.08] px-4 py-3 ring-1 ring-inset ring-white/15 backdrop-blur-xl [animation-delay:-3.5s]">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-white/50">Sharpe</p>
              <p className="mt-0.5 font-display text-[20px] font-semibold tabular-nums">{kpi.sharpe.toFixed(2)}</p>
            </div>
            <div className="h-9 w-px bg-white/15" />
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-white/50">Volatility</p>
              <p className="mt-0.5 font-display text-[20px] font-semibold tabular-nums">{kpi.vol.toFixed(1)}%</p>
            </div>
          </div>
        </div>
        <LiveCandles className="mt-6" height={260} count={44} />
      </div>

      <TickerTape tone="dark" className="mt-6 border-t border-white/10 pt-5" />
    </div>
  );
}
