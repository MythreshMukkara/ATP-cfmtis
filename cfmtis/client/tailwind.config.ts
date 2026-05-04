import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        body: ["IBM Plex Sans", "sans-serif"],
        cond: ["IBM Plex Sans Condensed", "sans-serif"],
        mono: ["IBM Plex Mono", "monospace"]
      },
      colors: {
        deep: "var(--bg-deep)",
        panel: "var(--bg-panel)",
        card: "var(--bg-card)",
        hover: "var(--bg-hover)",
        primary: "var(--text-primary)",
        secondary: "var(--text-secondary)",
        dim: "var(--text-dim)",
        border: "var(--border)",
        bright: "var(--border-bright)",
        blue: "var(--accent-blue)",
        cyan: "var(--accent-cyan)",
        red: "var(--accent-red)",
        orange: "var(--accent-orange)",
        yellow: "var(--accent-yellow)",
        green: "var(--accent-green)",
        purple: "var(--accent-purple)"
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(0,168,255,0.28), 0 10px 40px rgba(0,0,0,0.35)"
      }
    }
  },
  plugins: []
} satisfies Config;
