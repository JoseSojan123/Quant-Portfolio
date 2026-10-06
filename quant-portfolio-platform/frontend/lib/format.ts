const usd0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const usd2 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

type N = number | null | undefined;

export function money(v: N, opts: { cents?: boolean; compact?: boolean; signed?: boolean } = {}): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "–";
  const sign = opts.signed && v > 0 ? "+" : "";
  if (opts.compact && Math.abs(v) >= 10000) return `${v < 0 ? "-" : sign}$${compact.format(Math.abs(v))}`;
  return sign + (opts.cents ? usd2 : usd0).format(v);
}

export function pct(v: N, digits = 1, signed = false): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "–";
  const s = (v * 100).toFixed(digits);
  return `${signed && v > 0 ? "+" : ""}${s}%`;
}

export function num(v: N, digits = 2): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "–";
  return v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function qty(v: N): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "–";
  return v.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

export function date(s: string | null | undefined, withYear = true): string {
  if (!s) return "–";
  const d = new Date(s.length === 10 ? `${s}T00:00:00` : s);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(withYear ? { year: "numeric" } : {}) });
}

/** "Jan 2020": for period labels that span years. */
export function monthYear(s: string | null | undefined): string {
  if (!s) return "–";
  const d = new Date(s.length === 10 ? `${s}T00:00:00` : s);
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

/**
 * Tick formatter for a date axis. A window longer than about ten months gets
 * "Mar '24" ticks, because "Mar 5" alone repeats every year and reads ambiguously.
 */
export function dateTickFormatter(first: unknown, last: unknown): (v: unknown) => string {
  const a = Date.parse(String(first));
  const b = Date.parse(String(last));
  const long = Number.isFinite(a) && Number.isFinite(b) && Math.abs(b - a) > 300 * 86_400_000;
  return (v) => {
    const s = String(v);
    const d = new Date(s.length === 10 ? `${s}T00:00:00` : s);
    if (Number.isNaN(d.getTime())) return s;
    return long
      ? `${d.toLocaleDateString("en-US", { month: "short" })} '${String(d.getFullYear()).slice(2)}`
      : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };
}

export function dateTime(s: string | null | undefined): string {
  if (!s) return "–";
  return new Date(s).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

/** Tailwind text class for a signed financial value: green up, red down, neutral at zero. */
export function tone(v: N): string {
  if (v === null || v === undefined || !Number.isFinite(v) || Math.abs(v) < 1e-12) return "text-ink";
  return v > 0 ? "text-pos" : "text-neg";
}

export function axisPct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

export function axisMoney(v: number): string {
  return `$${compact.format(v)}`;
}
