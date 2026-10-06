"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Logo } from "@/components/layout/app-shell";
import { LinkButton } from "@/components/ui";
import { useAuth } from "@/lib/auth";

/**
 * Shell for the two pages that are readable without an account: /methodology and
 * /about. Signed-in visitors get a link back to the app instead of sign-up buttons.
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-white">
      <header className="glass sticky top-0 z-40 border-b">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-3 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2">
            <Logo />
            <span className="font-display text-[15px] font-semibold tracking-tighter2">Quant Portfolio</span>
          </Link>
          <nav className="ml-auto flex items-center gap-1 sm:gap-2">
            <Link
              href="/methodology"
              className={`rounded-full px-3 py-1.5 text-[13px] transition hover:text-ink ${pathname === "/methodology" ? "font-medium text-ink" : "text-ink-2"}`}
            >
              Methodology
            </Link>
            <Link
              href="/about"
              className={`rounded-full px-3 py-1.5 text-[13px] transition hover:text-ink ${pathname === "/about" ? "font-medium text-ink" : "text-ink-2"}`}
            >
              About
            </Link>
            {user ? (
              <LinkButton href="/dashboard" size="sm" variant="secondary">
                Back to app
              </LinkButton>
            ) : (
              <LinkButton href="/signup" size="sm">
                Create account
              </LinkButton>
            )}
          </nav>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-5xl animate-rise px-4 py-10 sm:px-6 sm:py-16">
        {children}
      </main>

      <footer className="border-t border-hair bg-page">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-6 text-xs text-ink-3 sm:px-6">
          <Link href="/" className="inline-flex items-center gap-1.5 hover:text-ink">
            <ArrowLeft className="h-3.5 w-3.5" />
            Home
          </Link>
          <span>Educational analysis tool. Not investment advice.</span>
        </div>
      </footer>
    </div>
  );
}
