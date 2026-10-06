"use client";

import clsx from "clsx";
import type { ReactNode } from "react";

import { HowCalculated } from "@/components/ui";
import type { InputMeta } from "@/lib/types";

export function PageHeader({ title, subtitle, children, help }: { title: string; subtitle?: string; children?: ReactNode; help?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 sm:mb-8">
      <div className="min-w-0">
        <h1 className="flex items-center gap-2 font-display text-[28px] font-semibold leading-tight tracking-tightest text-ink sm:text-[34px]">
          {title}
          {help ? <HowCalculated>{help}</HowCalculated> : null}
        </h1>
        {subtitle ? <p className="mt-1.5 max-w-2xl text-[15px] leading-relaxed text-ink-2 sm:text-[17px]">{subtitle}</p> : null}
      </div>
      {children ? <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">{children}</div> : null}
    </div>
  );
}

export const RETURN_LABEL: Record<string, string> = {
  historical: "historical mean",
  bayes_stein: "Bayes-Stein shrunk mean",
  capm: "CAPM equilibrium",
};
export const COV_LABEL: Record<string, string> = {
  sample: "sample covariance",
  ledoit_wolf: "Ledoit-Wolf shrinkage",
  ewma: "EWMA (lambda 0.94)",
};

/** Provenance line: every page states the window and estimators behind its numbers. */
export function InputsNote({ inputs, className }: { inputs: InputMeta; className?: string }) {
  return (
    <p className={clsx("text-xs leading-relaxed text-ink-3", className)}>
      Estimated from {inputs.observations.toLocaleString()} trading days ({inputs.start} to {inputs.end}) · expected returns:{" "}
      {RETURN_LABEL[inputs.return_method] ?? inputs.return_method} · covariance: {COV_LABEL[inputs.cov_method] ?? inputs.cov_method} · risk-free rate{" "}
      {(inputs.risk_free_rate * 100).toFixed(1)}% · annualized with {inputs.annualization} trading days
    </p>
  );
}
