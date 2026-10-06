"use client";

import { SWRConfig } from "swr";

import { fetcher } from "@/lib/api";
import { AuthProvider } from "@/lib/auth";
import { PortfolioProvider } from "@/lib/portfolio-context";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig value={{ fetcher, revalidateOnFocus: false, shouldRetryOnError: false }}>
      <AuthProvider>
        <PortfolioProvider>{children}</PortfolioProvider>
      </AuthProvider>
    </SWRConfig>
  );
}
