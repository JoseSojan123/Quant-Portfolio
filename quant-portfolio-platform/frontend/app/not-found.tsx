import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-page px-4 text-center">
      <p className="num text-sm font-medium text-brand-600">404</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink">This page does not exist</h1>
      <p className="mt-2 max-w-md text-ink-2">
        The link may be out of date. Everything the app can do is reachable from the dashboard.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/dashboard"
          className="inline-flex min-h-[44px] items-center rounded-full bg-brand-600 px-5 text-sm font-medium text-white transition hover:bg-[#0077ed]"
        >
          Go to the dashboard
        </Link>
        <Link href="/" className="inline-flex min-h-[44px] items-center rounded-full px-5 text-sm font-medium text-ink-2 hover:bg-white hover:text-ink">
          Back to the home page
        </Link>
      </div>
    </main>
  );
}
