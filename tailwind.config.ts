import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      // ─── Design tokens ──────────────────────────────────────────────────────
      colors: {
        // Normal theme palette
        brand: {
          50: "#f0f9ff",
          100: "#e0f2fe",
          200: "#bae6fd",
          300: "#7dd3fc",
          400: "#38bdf8",
          500: "#0ea5e9",
          600: "#0284c7",
          700: "#0369a1",
          800: "#075985",
          900: "#0c4a6e",
        },
        // Urgency colours (shared across themes)
        urgency: {
          emergency: "#dc2626", // red-600
          urgent: "#ea580c",    // orange-600
          soon: "#ca8a04",      // yellow-600
          monitor: "#16a34a",   // green-600
        },
        // Haunted theme accent palette
        haunted: {
          bg: "#0f0a1a",
          surface: "#1a1028",
          border: "#3d2d5c",
          accent: "#a855f7",    // purple-500
          glow: "#7c3aed",      // violet-600
          text: "#e9d5ff",      // purple-100
          muted: "#9ca3af",     // gray-400
        },
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "monospace"],
      },
      borderRadius: {
        "4xl": "2rem",
      },
      boxShadow: {
        "haunted-glow": "0 0 20px 4px rgba(168, 85, 247, 0.3)",
        "haunted-card": "0 4px 24px 0 rgba(124, 58, 237, 0.2)",
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        flicker: "flicker 0.15s infinite",
      },
      keyframes: {
        flicker: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.85" },
        },
      },
    },
  },
  plugins: [
    // ─── haunted: variant ───────────────────────────────────────────────────
    // Apply with `haunted:bg-haunted-bg` etc. when the root element has the
    // class `theme-haunted`. Toggle between themes by toggling this class.
    //
    // Usage: <html class="theme-haunted"> enables all haunted: utilities.
    plugin(function ({ addVariant }) {
      addVariant("haunted", ".theme-haunted &");
    }),
  ],
};

export default config;
