import type { Config } from "tailwindcss";

// Tailwind-Utilities zeigen auf die CSS-Custom-Properties aus globals.css,
// nicht auf hartcodierte Hex-Werte. Siehe
// docs/decisions/2026-07-13_konsole-block1-vorgangs-detailansicht.md,
// Abschnitt 2 (Design-Token-System, White-Label-Vorbereitung).
const config: Config = {
  content: ["./src/app/**/*.{js,ts,jsx,tsx,mdx}", "./src/components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: "var(--color-primary)", hover: "var(--color-primary-hover)" },
        accent: "var(--color-accent)",
        surface: { DEFAULT: "var(--color-bg)", subtle: "var(--color-bg-subtle)" },
        border: "var(--color-border)",
        ink: { DEFAULT: "var(--color-text)", muted: "var(--color-text-muted)" },
        danger: { DEFAULT: "var(--color-danger)", bg: "var(--color-danger-bg)", border: "var(--color-danger-border)" },
        warning: { DEFAULT: "var(--color-warning)", bg: "var(--color-warning-bg)", border: "var(--color-warning-border)" },
        info: { bg: "var(--color-info-bg)", border: "var(--color-info-border)" },
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
      },
    },
  },
  plugins: [],
};

export default config;
