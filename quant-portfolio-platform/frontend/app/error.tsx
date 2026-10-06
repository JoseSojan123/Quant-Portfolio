"use client";

import { RotateCcw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // The server logs its own errors; this is the browser-side record.
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-page px-4 text-center">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Something went wrong on this page</h1>
      <p className="mt-2 max-w-md text-ink-2">
        Your holdings are safe — nothing is written to your portfolio by a page that fails to render. Try again, and if it
        keeps happening, go back to the dashboard.
      </p>
      {error.digest ? <p className="num mt-3 text-xs text-ink-3">Reference: {error.digest}</p> : null}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <button
          onClick={reset}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-brand-600 px-5 text-sm font-medium text-white transition hover:bg-[#0077ed]"
        >
          <RotateCcw className="h-4 w-4" aria-hidden />
          Try again
        </button>
        <Link href="/dashboard" className="inline-flex min-h-[44px] items-center rounded-full px-5 text-sm font-medium text-ink-2 hover:bg-white hover:text-ink">
          Go to the dashboard
        </Link>
      </div>
    </main>
  );
}
