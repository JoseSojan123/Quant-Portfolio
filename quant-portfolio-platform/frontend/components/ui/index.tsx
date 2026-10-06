"use client";

import clsx from "clsx";
import { AlertTriangle, Check, ChevronDown, Info, Loader2, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import { money, pct, tone } from "@/lib/format";

/* ---------------------------------------------------------------- surfaces */

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={clsx("card", className)}>{children}</section>;
}

export function CardHead({ title, subtitle, right, help }: { title: string; subtitle?: string; right?: ReactNode; help?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 px-5 pb-1 pt-5 sm:px-6 sm:pt-6">
      <div className="min-w-0">
        <h2 className="flex items-center gap-1.5 font-display text-[17px] font-semibold tracking-tighter2 text-ink">
          {title}
          {help ? <HowCalculated>{help}</HowCalculated> : null}
        </h2>
        {subtitle ? <p className="mt-0.5 text-[13px] leading-snug text-ink-2">{subtitle}</p> : null}
      </div>
      {right ? <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">{right}</div> : null}
    </div>
  );
}

/** "How is this calculated?" popover — the blueprint's core design principle. */
export function HowCalculated({ children, label = "How is this calculated?" }: { children: ReactNode; label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <span className="relative inline-flex" ref={ref}>
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="rounded-full p-0.5 text-ink-3 transition hover:bg-brand-50 hover:text-brand-600"
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      {open ? (
        <span className="absolute left-0 top-7 z-30 w-72 animate-rise rounded-2xl bg-white/95 p-4 font-sans text-[13px] font-normal leading-relaxed tracking-normal text-ink-2 shadow-pop backdrop-blur-xl sm:w-80 [&_p+p]:mt-2">
          {children}
        </span>
      ) : null}
    </span>
  );
}

/* ---------------------------------------------------------------- controls */

type ButtonProps = {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  loading?: boolean;
  children: ReactNode;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children">;

const BTN: Record<string, string> = {
  primary: "bg-brand-600 text-white shadow-[0_1px_2px_rgba(0,0,0,0.08)] hover:bg-[#0077ed] active:bg-brand-700 disabled:bg-brand-200 disabled:shadow-none",
  secondary: "bg-black/[0.045] text-ink hover:bg-black/[0.075] active:bg-black/[0.1] disabled:text-ink-3",
  ghost: "text-ink-2 hover:bg-black/[0.045] hover:text-ink",
  danger: "bg-neg-soft text-neg hover:bg-[#fbdde1]",
};

const BTN_BASE =
  "inline-flex items-center justify-center gap-2 rounded-full font-medium tracking-[-0.01em] transition duration-200 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-600/25 disabled:cursor-not-allowed disabled:active:scale-100";

export function Button({ variant = "primary", size = "md", loading, className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={clsx(
        BTN_BASE,
        size === "sm" ? "min-h-[34px] px-4 py-1.5 text-[13px]" : "min-h-[42px] px-5 py-2.5 text-[15px] sm:text-sm",
        BTN[variant],
        className,
      )}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {children}
    </button>
  );
}

export function LinkButton({ href, variant = "primary", size = "md", className, children }: { href: string; variant?: "primary" | "secondary" | "ghost"; size?: "sm" | "md"; className?: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className={clsx(
        BTN_BASE,
        size === "sm" ? "min-h-[34px] px-4 py-1.5 text-[13px]" : "min-h-[42px] px-5 py-2.5 text-[15px] sm:text-sm",
        BTN[variant],
        className,
      )}
    >
      {children}
    </Link>
  );
}

export function Field({ label, hint, error, children, htmlFor }: { label: string; hint?: string; error?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div>
      <label className="label mb-1.5 block" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {error ? <p className="mt-1 text-xs text-neg">{error}</p> : hint ? <p className="mt-1 text-xs text-ink-3">{hint}</p> : null}
    </div>
  );
}

export function Select({ value, onChange, options, className, id, ariaLabel }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; className?: string; id?: string; ariaLabel?: string }) {
  return (
    <div className={clsx("relative", className)}>
      <select
        id={id}
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input min-h-[44px] cursor-pointer appearance-none pr-10"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
    </div>
  );
}

export function NumberInput({ value, onChange, min, max, step, suffix, id, className, placeholder }: { value: number | ""; onChange: (v: number | "") => void; min?: number; max?: number; step?: number; suffix?: string; id?: string; className?: string; placeholder?: string }) {
  return (
    <div className={clsx("relative", className)}>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        value={value}
        min={min}
        max={max}
        step={step}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
        className={clsx("input num", suffix && "pr-10")}
      />
      {suffix ? <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-3">{suffix}</span> : null}
    </div>
  );
}

export function Slider({ value, onChange, min, max, step, label, display, id }: { value: number; onChange: (v: number) => void; min: number; max: number; step: number; label: string; display: string; id?: string }) {
  const genId = useId();
  const inputId = id ?? genId;
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <label className="label" htmlFor={inputId}>
          {label}
        </label>
        <span className="num rounded-full bg-black/[0.045] px-2 py-0.5 text-xs font-semibold text-ink">{display}</span>
      </div>
      <input
        id={inputId}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="range w-full cursor-pointer"
        style={{ ["--fill" as string]: `${max > min ? ((value - min) / (max - min)) * 100 : 0}%` }}
      />
    </div>
  );
}

export function Toggle({ checked, onChange, label, hint, id }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; id?: string }) {
  const genId = useId();
  const inputId = id ?? genId;
  return (
    <label htmlFor={inputId} className="flex cursor-pointer items-start gap-3 py-1">
      <input id={inputId} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span className="relative inline-flex h-[26px] w-[44px] shrink-0 items-center rounded-full bg-[#e3e3e8] transition-colors duration-300 peer-checked:bg-brand-600 peer-focus-visible:ring-4 peer-focus-visible:ring-brand-600/25">
        <span
          className={clsx(
            "ml-[2px] inline-block h-[22px] w-[22px] rounded-full bg-white shadow-thumb transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
            checked && "translate-x-[18px]",
          )}
        />
      </span>
      <span className="min-w-0 pt-0.5">
        <span className="block text-[15px] leading-snug text-ink sm:text-sm">{label}</span>
        {hint ? <span className="mt-0.5 block text-xs leading-snug text-ink-3">{hint}</span> : null}
      </span>
    </label>
  );
}

export function SegmentedControl<T extends string>({ value, onChange, options, ariaLabel }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; ariaLabel?: string }) {
  return (
    <div role="tablist" aria-label={ariaLabel} className="inline-flex max-w-full gap-0.5 overflow-x-auto rounded-[11px] bg-black/[0.055] p-[3px]">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={clsx(
            "min-h-[30px] whitespace-nowrap rounded-[8px] px-3.5 text-[13px] font-medium transition duration-200",
            value === o.value ? "bg-white text-ink shadow-thumb" : "text-ink-2 hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- feedback */

export function Alert({ kind = "info", title, children, onClose }: { kind?: "info" | "warning" | "error" | "success"; title?: string; children?: ReactNode; onClose?: () => void }) {
  const style = {
    info: "bg-brand-50/80 text-brand-900 ring-1 ring-inset ring-brand-600/10",
    warning: "bg-warn-soft text-warn ring-1 ring-inset ring-warn/10",
    error: "bg-neg-soft text-neg ring-1 ring-inset ring-neg/10",
    success: "bg-pos-soft text-pos ring-1 ring-inset ring-pos/10",
  }[kind];
  const Icon = kind === "error" || kind === "warning" ? AlertTriangle : kind === "success" ? Check : Info;
  return (
    <div role={kind === "error" ? "alert" : "status"} className={clsx("flex items-start gap-3 rounded-2xl px-4 py-3.5 text-sm", style)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={clsx("leading-relaxed", title && "mt-0.5")}>{children}</div> : null}
      </div>
      {onClose ? (
        <button onClick={onClose} aria-label="Dismiss" className="shrink-0 rounded p-0.5 hover:bg-white/60">
          <X className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-ink-2">
      <Loader2 className="h-4 w-4 animate-spin" />
      {label}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx("animate-pulse rounded-3xl bg-black/[0.045]", className)} />;
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="px-5 py-14 text-center">
      <p className="font-display text-[17px] font-semibold tracking-tighter2 text-ink">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-ink-2">{body}</p>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function Badge({ kind = "neutral", children }: { kind?: "neutral" | "pos" | "neg" | "warn" | "brand"; children: ReactNode }) {
  const style = {
    neutral: "bg-black/[0.045] text-ink-2",
    pos: "bg-pos-soft text-pos",
    neg: "bg-neg-soft text-neg",
    warn: "bg-warn-soft text-warn",
    brand: "bg-brand-50 text-brand-700",
  }[kind];
  return <span className={clsx("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium", style)}>{children}</span>;
}

/* ---------------------------------------------------------------- figures */

/** Stat tile: label, value, optional delta against a named period, optional footnote. */
export function Stat({
  label,
  value,
  delta,
  deltaLabel,
  hint,
  help,
  size = "md",
  deltaIsGood,
}: {
  label: string;
  value: string;
  delta?: number | null;
  deltaLabel?: string;
  hint?: string;
  help?: ReactNode;
  size?: "md" | "lg";
  deltaIsGood?: boolean;
}) {
  const good = deltaIsGood ?? true;
  const deltaTone = delta === null || delta === undefined || Math.abs(delta) < 1e-12 ? "text-ink-2" : (delta > 0) === good ? "text-pos" : "text-neg";
  return (
    <div className="min-w-0">
      <p className="label flex items-center gap-1">
        {label}
        {help ? <HowCalculated>{help}</HowCalculated> : null}
      </p>
      <p className={clsx("num mt-1 font-display font-semibold tracking-tighter2 text-ink", size === "lg" ? "text-[32px] leading-tight sm:text-[40px]" : "text-[22px] leading-tight sm:text-2xl")}>{value}</p>
      {delta !== undefined && delta !== null ? (
        <p className={clsx("num mt-0.5 text-xs font-medium", deltaTone)}>
          {pct(delta, 2, true)}
          {deltaLabel ? <span className="font-normal text-ink-3"> {deltaLabel}</span> : null}
        </p>
      ) : hint ? (
        <p className="mt-0.5 text-xs text-ink-3">{hint}</p>
      ) : null}
    </div>
  );
}

export function MoneyDelta({ value, percent }: { value: number | null; percent?: number | null }) {
  return (
    <span className={clsx("num font-medium", tone(value))}>
      {money(value, { signed: true, cents: Math.abs(value ?? 0) < 1000 })}
      {percent !== undefined && percent !== null ? <span className="font-normal"> ({pct(percent, 2, true)})</span> : null}
    </span>
  );
}

/** Horizontally scrollable KPI row on phones, grid on larger screens. */
export function StatRow({ children, cols = 4 }: { children: ReactNode; cols?: 3 | 4 | 5 | 6 }) {
  const grid = { 3: "sm:grid-cols-3", 4: "sm:grid-cols-2 lg:grid-cols-4", 5: "sm:grid-cols-3 lg:grid-cols-5", 6: "sm:grid-cols-3 lg:grid-cols-6" }[cols];
  return <div className={clsx("grid grid-cols-2 gap-x-4 gap-y-5 sm:gap-6", grid)}>{children}</div>;
}
