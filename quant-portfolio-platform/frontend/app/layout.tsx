import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";

import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Quant Portfolio — portfolio construction & risk platform",
    template: "%s · Quant Portfolio",
  },
  description:
    "Enter your holdings and get quantitative analysis: risk decomposition, VaR and Expected Shortfall, constrained optimization, Monte Carlo, stress tests, rebalancing and walk-forward backtests.",
  applicationName: "Quant Portfolio",
  robots: { index: true, follow: true },
  icons: { icon: "/icon.svg" },
  openGraph: {
    title: "Quant Portfolio — portfolio construction & risk platform",
    description:
      "Risk decomposition, constrained optimization, Monte Carlo, stress tests and walk-forward backtests, with every formula explained.",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="font-sans antialiased">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-brand-600 focus:px-3 focus:py-2 focus:text-sm focus:text-white">
          Skip to content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
