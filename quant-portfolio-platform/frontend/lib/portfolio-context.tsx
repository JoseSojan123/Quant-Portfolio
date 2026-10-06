"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import useSWR from "swr";

import { fetcher } from "./api";
import { useAuth } from "./auth";
import type { PortfolioSummary } from "./types";

type State = {
  portfolios: PortfolioSummary[];
  activeId: string | null;
  active: PortfolioSummary | null;
  setActiveId: (id: string) => void;
  loading: boolean;
  reload: () => void;
};

const Ctx = createContext<State>({
  portfolios: [],
  activeId: null,
  active: null,
  setActiveId: () => {},
  loading: true,
  reload: () => {},
});

const KEY = "qpp.activePortfolio";

/** Which portfolio the analytics pages are looking at, remembered across navigation. */
export function PortfolioProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { data, isLoading, mutate } = useSWR<PortfolioSummary[]>(user ? "/portfolios" : null, fetcher);
  const [activeId, setActive] = useState<string | null>(null);

  useEffect(() => {
    if (!data?.length) {
      setActive(null);
      return;
    }
    const stored = typeof window !== "undefined" ? window.localStorage.getItem(KEY) : null;
    const candidates = [activeId, stored, user?.default_portfolio_id, data[0].id];
    const pick = candidates.find((c) => c && data.some((p) => p.id === c)) ?? data[0].id;
    setActive(pick as string);
  }, [data, user?.default_portfolio_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const setActiveId = useCallback((id: string) => {
    setActive(id);
    try {
      window.localStorage.setItem(KEY, id);
    } catch {
      /* private browsing */
    }
  }, []);

  const value = useMemo(
    () => ({
      portfolios: data ?? [],
      activeId,
      active: (data ?? []).find((p) => p.id === activeId) ?? null,
      setActiveId,
      loading: isLoading,
      reload: () => void mutate(),
    }),
    [data, activeId, setActiveId, isLoading, mutate],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePortfolios() {
  return useContext(Ctx);
}
