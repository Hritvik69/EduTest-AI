import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
    "./types/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#0a0e1a",
        primary: "#3b82f6",
        accent: "#f59e0b",
        success: "#10b981",
        card: "#0f1629",
        border: "#1e2d4a",
        muted: "#94a3b8",
      },
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
      boxShadow: {
        glow: "0 0 34px rgb(59 130 246 / 0.34)",
        gold: "0 0 30px rgb(245 158 11 / 0.22)",
      },
      keyframes: {
        pulseDot: {
          "0%, 100%": { transform: "scale(1)", opacity: "1" },
          "50%": { transform: "scale(1.35)", opacity: "0.65" },
        },
      },
      animation: {
        pulseDot: "pulseDot 1.7s ease-in-out infinite",
      },
    },
  },
  plugins: [animate],
};

export default config;
