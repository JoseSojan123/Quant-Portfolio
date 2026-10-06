import type { Config } from "tailwindcss";

// Visual system: white surfaces on a soft gray canvas, one blue accent with an indigo
// partner used only for gradients, hairline dividers and large, tight type.
// Green/red stay reserved for positive/negative financial movement.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        // SF Pro on Apple devices; Geist everywhere else.
        sans: ["-apple-system", "BlinkMacSystemFont", '"SF Pro Text"', "var(--font-geist-sans)", '"Helvetica Neue"', "system-ui", "sans-serif"],
        display: ["-apple-system", "BlinkMacSystemFont", '"SF Pro Display"', "var(--font-geist-sans)", '"Helvetica Neue"', "system-ui", "sans-serif"],
        mono: ['"SF Mono"', "var(--font-geist-mono)", "ui-monospace", "monospace"],
      },
      colors: {
        page: "#f5f5f7",
        line: "#e3e3e8",
        hair: "rgba(0, 0, 0, 0.06)",
        ink: { DEFAULT: "#1d1d1f", 2: "#6e6e73", 3: "#8e8e93" },
        brand: {
          50: "#eef5ff", 100: "#dbeaff", 200: "#b6d4ff", 500: "#2b8bf2", 600: "#0071e3", 700: "#0060c0", 900: "#0a2f5c",
        },
        indigo: { 500: "#5e5ce6", 600: "#4f46e5" },
        pos: { DEFAULT: "#1d7f3a", soft: "#eaf7ee" },
        neg: { DEFAULT: "#d70015", soft: "#fdecee" },
        warn: { DEFAULT: "#a35200", soft: "#fff4e5" },
      },
      boxShadow: {
        card: "0 0 0 1px rgba(0, 0, 0, 0.035), 0 1px 2px rgba(0, 0, 0, 0.03), 0 6px 24px -6px rgba(0, 0, 0, 0.06)",
        lift: "0 0 0 1px rgba(0, 0, 0, 0.04), 0 2px 6px rgba(0, 0, 0, 0.04), 0 18px 48px -12px rgba(0, 0, 0, 0.12)",
        pop: "0 0 0 1px rgba(0, 0, 0, 0.05), 0 12px 32px -8px rgba(0, 0, 0, 0.18), 0 4px 10px -4px rgba(0, 0, 0, 0.08)",
        thumb: "0 1px 2px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.08)",
        glow: "0 8px 24px -8px rgba(0, 113, 227, 0.55)",
      },
      borderRadius: { xl: "0.875rem", "2xl": "1.125rem", "3xl": "1.5rem" },
      letterSpacing: { tightest: "-0.035em", tighter2: "-0.022em" },
      keyframes: {
        rise: { "0%": { opacity: "0", transform: "translateY(6px)" }, "100%": { opacity: "1", transform: "translateY(0)" } },
        fade: { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
        float: { "0%, 100%": { transform: "translateY(0)" }, "50%": { transform: "translateY(-6px)" } },
        marquee: { "0%": { transform: "translateX(0)" }, "100%": { transform: "translateX(-50%)" } },
        draw: { "0%": { strokeDasharray: "1", strokeDashoffset: "1" }, "100%": { strokeDasharray: "1", strokeDashoffset: "0" } },
        grow: { "0%": { transform: "scaleX(0)" }, "100%": { transform: "scaleX(1)" } },
        "flash-up": { "0%": { backgroundColor: "rgba(29,127,58,0.16)", color: "#1d7f3a" }, "100%": { backgroundColor: "transparent" } },
        "flash-down": { "0%": { backgroundColor: "rgba(215,0,21,0.12)", color: "#d70015" }, "100%": { backgroundColor: "transparent" } },
        "flash-up-dark": { "0%": { backgroundColor: "rgba(48,209,88,0.25)", color: "#30d158" }, "100%": { backgroundColor: "transparent" } },
        "flash-down-dark": { "0%": { backgroundColor: "rgba(255,69,58,0.25)", color: "#ff6961" }, "100%": { backgroundColor: "transparent" } },
        glow: { "0%, 100%": { opacity: "0.55", transform: "scale(1)" }, "50%": { opacity: "0.85", transform: "scale(1.06)" } },
      },
      animation: {
        rise: "rise 0.45s cubic-bezier(0.22, 1, 0.36, 1) both",
        fade: "fade 0.3s ease-out both",
        float: "float 7s ease-in-out infinite",
        marquee: "marquee 60s linear infinite",
        draw: "draw 1.8s cubic-bezier(0.65, 0, 0.35, 1) both",
        grow: "grow 1s cubic-bezier(0.22, 1, 0.36, 1) both",
        "flash-up": "flash-up 1.1s ease-out",
        "flash-down": "flash-down 1.1s ease-out",
        "flash-up-dark": "flash-up-dark 1.1s ease-out",
        "flash-down-dark": "flash-down-dark 1.1s ease-out",
        glow: "glow 8s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
export default config;
