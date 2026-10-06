import Link from "next/link";

import { Logo } from "@/components/layout/app-shell";
import { AuthMarketPanel, TickerTape } from "@/components/marketing/motion";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative isolate flex min-h-screen flex-col overflow-hidden bg-page">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-[-200px] h-[560px] w-[900px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(0,113,227,0.14),transparent)]" />
        <div className="absolute bottom-[-180px] right-[-120px] h-[460px] w-[560px] rounded-full bg-[radial-gradient(closest-side,rgba(94,92,230,0.10),transparent)]" />
      </div>
      <header className="mx-auto flex h-16 w-full max-w-[1400px] items-center px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2">
          <Logo />
          <span className="font-display text-[15px] font-semibold tracking-tighter2">Quant Portfolio</span>
        </Link>
      </header>
      {/* Phones and tablets get a slim live ticker instead of the full market panel. */}
      <div className="border-y border-black/[0.05] bg-white/60 py-2.5 backdrop-blur lg:hidden">
        <TickerTape className="px-4" />
      </div>
      <main id="main" className="mx-auto grid w-full max-w-[1400px] flex-1 gap-8 px-4 py-6 sm:py-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:px-8 lg:py-6">
        <div className="flex items-start justify-center sm:items-center">
          <div className="w-full max-w-[420px] animate-rise">{children}</div>
        </div>
        <div className="hidden animate-fade [animation-delay:150ms] [animation-duration:700ms] lg:block">
          <AuthMarketPanel />
        </div>
      </main>
      <footer className="px-4 py-6 text-center text-xs text-ink-3">
        Educational project. Nothing here is investment advice.{" "}
        <Link href="/methodology" className="underline decoration-ink-3/40 underline-offset-2 hover:text-ink-2">
          Methodology
        </Link>
      </footer>
    </div>
  );
}
