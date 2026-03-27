/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        heading: ["var(--font-heading)", "sans-serif"],
        body: ["var(--font-body)", "sans-serif"],
        display: ["var(--font-display)", "serif"],
      },
      colors: {
        // Light theme
        bg: "var(--bg)",
        surface: "var(--surface)",
        "surface-muted": "var(--surface-muted)",
        "surface-strong": "var(--surface-strong)",
        border: "var(--border)",
        "border-strong": "var(--border-strong)",
        text: {
          DEFAULT: "var(--text)",
          muted: "var(--text-muted)",
          quiet: "var(--text-quiet)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          strong: "var(--accent-strong)",
          soft: "var(--accent-soft)",
        },
        success: "var(--success)",
        warning: "var(--warning)",
        danger: "var(--danger)",
      },
      boxShadow: {
        panel: "var(--shadow-panel)",
        card: "var(--shadow-card)",
      },
      borderRadius: {
        DEFAULT: "0.75rem",
        sm: "0.5rem",
        md: "0.75rem",
        lg: "1rem",
        xl: "1.25rem",
        "2xl": "1.5rem",
      },
      spacing: {
        xs: "0.5rem",
        sm: "0.75rem",
        md: "1rem",
        lg: "1.5rem",
        xl: "2rem",
        "2xl": "2.5rem",
        "3xl": "3rem",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
