import {
  Activity,
  BarChart3,
  Briefcase,
  FlaskConical,
  GitCompareArrows,
  LayoutDashboard,
  LineChart,
  Repeat,
  Shuffle,
  Sliders,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { href: string; label: string; short: string; icon: LucideIcon; group: string };

export const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", short: "Home", icon: LayoutDashboard, group: "Portfolio" },
  { href: "/portfolio", label: "Holdings", short: "Holdings", icon: Briefcase, group: "Portfolio" },
  { href: "/optimize", label: "Optimize", short: "Optimize", icon: Sliders, group: "Decisions" },
  { href: "/efficient-frontier", label: "Efficient frontier", short: "Frontier", icon: LineChart, group: "Decisions" },
  { href: "/rebalance", label: "Rebalance", short: "Rebalance", icon: Repeat, group: "Decisions" },
  { href: "/risk", label: "Risk analysis", short: "Risk", icon: Activity, group: "Risk" },
  { href: "/stress-test", label: "Stress testing", short: "Stress", icon: FlaskConical, group: "Risk" },
  { href: "/monte-carlo", label: "Monte Carlo", short: "Simulate", icon: Shuffle, group: "Risk" },
  { href: "/what-if", label: "What-if", short: "What-if", icon: GitCompareArrows, group: "Risk" },
  { href: "/backtest", label: "Backtest", short: "Backtest", icon: BarChart3, group: "Research" },
];

/** Bottom-bar items on phones: the five most used destinations. */
export const MOBILE_NAV = ["/dashboard", "/portfolio", "/optimize", "/risk", "/monte-carlo"];
