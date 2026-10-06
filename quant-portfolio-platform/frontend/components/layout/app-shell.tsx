"use client";

import clsx from "clsx";
import { BookOpen, ChevronDown, Database, LogOut, Menu, Settings, User as UserIcon, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import useSWR from "swr";

import { fetcher } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { dateTime, money } from "@/lib/format";
import { usePortfolios } from "@/lib/portfolio-context";
import type { DataStatus } from "@/lib/types";
import { MOBILE_NAV, NAV } from "./nav";

/** Authenticated app chrome: sidebar on desktop, drawer + bottom bar on phones. */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [drawer, setDrawer] = useState(false);
  useEffect(() => setDrawer(false), [pathname]);

  const groups = NAV.reduce<Record<string, typeof NAV>>((acc, item) => {
    (acc[item.group] ||= []).push(item);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-page">
      <TopBar onMenu={() => setDrawer(true)} />

      <div className="mx-auto flex w-full max-w-[1500px]">
        <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-64 shrink-0 overflow-y-auto px-4 py-6 lg:block">
          <SideNav groups={groups} pathname={pathname} />
        </aside>

        {drawer ? (
          <div className="fixed inset-0 z-50 lg:hidden">
            <button className="absolute inset-0 animate-fade bg-black/25 backdrop-blur-[2px]" aria-label="Close menu" onClick={() => setDrawer(false)} />
            <nav className="absolute left-0 top-0 h-full w-72 max-w-[85vw] animate-rise overflow-y-auto bg-page/95 px-4 py-5 shadow-pop backdrop-blur-xl">
              <div className="mb-4 flex items-center justify-between px-2">
                <span className="font-display text-[17px] font-semibold tracking-tighter2">Menu</span>
                <button onClick={() => setDrawer(false)} aria-label="Close menu" className="rounded-full p-1.5 text-ink-2 hover:bg-black/[0.05]">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <SideNav groups={groups} pathname={pathname} />
            </nav>
          </div>
        ) : null}

        <main className="min-w-0 flex-1 px-4 pb-28 pt-6 sm:px-6 lg:px-8 lg:pb-12 lg:pt-8">
          <div key={pathname} className="animate-rise">
            {children}
          </div>
        </main>
      </div>

      <nav className="glass fixed bottom-0 left-0 right-0 z-40 border-t pb-[env(safe-area-inset-bottom)] lg:hidden" aria-label="Primary">
        <ul className="mx-auto flex max-w-xl">
          {MOBILE_NAV.map((href) => {
            const item = NAV.find((n) => n.href === href)!;
            const active = pathname === item.href;
            const Icon = item.icon;
            return (
              <li key={href} className="flex-1">
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={clsx("flex min-h-[58px] flex-col items-center justify-center gap-1 text-[10.5px] font-medium tracking-normal transition", active ? "text-brand-600" : "text-ink-3 hover:text-ink-2")}
                >
                  <Icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.2 : 1.8} />
                  {item.short}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

function SideNav({ groups, pathname }: { groups: Record<string, typeof NAV>; pathname: string }) {
  return (
    <div className="space-y-6">
      {Object.entries(groups).map(([group, items]) => (
        <div key={group}>
          <p className="eyebrow px-3 pb-2 text-[11px]">{group}</p>
          <ul className="space-y-0.5">
            {items.map((item) => {
              const active = pathname === item.href;
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={clsx(
                      "flex min-h-[38px] items-center gap-3 rounded-xl px-3 text-[14px] transition duration-200",
                      active ? "bg-white font-medium text-ink shadow-card" : "text-ink-2 hover:bg-black/[0.04] hover:text-ink",
                    )}
                  >
                    <Icon className={clsx("h-[17px] w-[17px] shrink-0", active ? "text-brand-600" : "text-ink-3")} strokeWidth={active ? 2.1 : 1.8} />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      <div className="border-t border-black/[0.06] pt-5">
        <ul className="space-y-0.5">
          <li>
            <Link href="/methodology" className="flex min-h-[38px] items-center gap-3 rounded-xl px-3 text-[14px] text-ink-2 transition duration-200 hover:bg-black/[0.04] hover:text-ink">
              <BookOpen className="h-[17px] w-[17px] text-ink-3" strokeWidth={1.8} />
              Methodology
            </Link>
          </li>
          <li>
            <Link href="/settings" className="flex min-h-[38px] items-center gap-3 rounded-xl px-3 text-[14px] text-ink-2 transition duration-200 hover:bg-black/[0.04] hover:text-ink">
              <Settings className="h-[17px] w-[17px] text-ink-3" strokeWidth={1.8} />
              Settings
            </Link>
          </li>
        </ul>
      </div>
    </div>
  );
}

function TopBar({ onMenu }: { onMenu: () => void }) {
  const { user, logout } = useAuth();
  const { portfolios, activeId, setActiveId } = usePortfolios();
  const { data: status } = useSWR<DataStatus>("/meta/data-status", fetcher, { refreshInterval: 300000 });
  const [menu, setMenu] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setMenu(false);
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const active = portfolios.find((p) => p.id === activeId);

  return (
    <header className="glass sticky top-0 z-40 h-14 border-b">
      <div className="mx-auto flex h-full w-full max-w-[1500px] items-center gap-2 px-3 sm:px-6">
        <button onClick={onMenu} aria-label="Open menu" className="-ml-1 rounded-full p-2 text-ink-2 hover:bg-black/[0.05] lg:hidden">
          <Menu className="h-5 w-5" />
        </button>
        <Link href="/dashboard" className="flex items-center gap-2">
          <Logo />
          <span className="hidden font-display text-[15px] font-semibold tracking-tighter2 sm:inline">Quant Portfolio</span>
        </Link>

        {portfolios.length > 0 ? (
          <div className="ml-2 min-w-0 flex-1 sm:ml-4 sm:flex-none">
            <label className="sr-only" htmlFor="portfolio-switch">
              Active portfolio
            </label>
            <div className="relative">
              <select
                id="portfolio-switch"
                value={activeId ?? ""}
                onChange={(e) => setActiveId(e.target.value)}
                className="w-full max-w-[230px] cursor-pointer appearance-none truncate rounded-full bg-black/[0.045] py-1.5 pl-3.5 pr-8 text-[13px] font-medium text-ink outline-none transition hover:bg-black/[0.07] focus:ring-4 focus:ring-brand-600/20"
              >
                {portfolios.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-3" />
            </div>
          </div>
        ) : null}

        <div className="ml-auto flex items-center gap-2">
          {active?.current_value ? (
            <span className="num hidden font-display text-[15px] font-semibold tracking-tighter2 text-ink md:inline">{money(active.current_value)}</span>
          ) : null}
          {status ? (
            <span
              className="hidden items-center gap-1.5 rounded-full bg-black/[0.045] px-2.5 py-1 text-[11px] font-medium text-ink-2 lg:inline-flex"
              title={`Data source: ${status.source}. Last updated ${dateTime(status.last_updated)}.`}
            >
              <Database className="h-3 w-3" />
              {status.synthetic ? "Demo data" : status.source}
              {status.last_date ? <span className="text-ink-3">· {status.last_date}</span> : null}
            </span>
          ) : null}

          <div className="relative" ref={ref}>
            <button
              onClick={() => setMenu((v) => !v)}
              aria-expanded={menu}
              aria-label="Account menu"
              className="flex min-h-[36px] items-center gap-1 rounded-full py-1 pl-1 pr-2 text-sm text-ink transition hover:bg-black/[0.05]"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-indigo-500 text-[11px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]">
                {initials(user?.full_name)}
              </span>
              <ChevronDown className="h-3.5 w-3.5 text-ink-3" />
            </button>
            {menu ? (
              <div className="absolute right-0 top-12 w-64 animate-rise rounded-2xl bg-white/95 p-1.5 shadow-pop backdrop-blur-xl">
                <div className="px-3 pb-2.5 pt-2">
                  <p className="truncate text-sm font-medium text-ink">{user?.full_name}</p>
                  <p className="truncate text-xs text-ink-3">{user?.is_guest ? "Demo account" : user?.email}</p>
                </div>
                {user?.is_guest ? (
                  <Link href="/signup" className="mb-1 block rounded-xl bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-[#0077ed]">
                    Create a free account
                  </Link>
                ) : null}
                <Link href="/profile" className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-ink hover:bg-black/[0.045]">
                  <UserIcon className="h-4 w-4" /> Profile
                </Link>
                <Link href="/settings" className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-ink hover:bg-black/[0.045]">
                  <Settings className="h-4 w-4" /> Settings
                </Link>
                <button onClick={() => void logout()} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm text-ink hover:bg-black/[0.045]">
                  <LogOut className="h-4 w-4" /> Sign out
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span
      className={clsx(
        "flex h-7 w-7 items-center justify-center rounded-[9px] bg-gradient-to-br from-[#2b8bf2] via-brand-600 to-indigo-500 shadow-[0_2px_8px_-2px_rgba(0,113,227,0.5),inset_0_1px_0_rgba(255,255,255,0.25)]",
        className,
      )}
      aria-hidden
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M2 12.5L5.5 7.5L8.5 10L13.5 3" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="13.5" cy="3" r="1.6" fill="white" />
      </svg>
    </span>
  );
}

function initials(name?: string | null): string {
  if (!name) return "–";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}
