/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        app: "var(--bg)",
        elev: "var(--bg-elev)",
        elev2: "var(--bg-elev-2)",
        wash: "var(--hover)",
        line: "var(--border)",
        strong: "var(--border-strong)",
        ink: "var(--text)",
        muted: "var(--text-muted)",
        faint: "var(--text-faint)",
        accent: {
          DEFAULT: "var(--accent)",
          on: "var(--accent-text-on)",
          soft: "var(--accent-bg)",
        },
        danger: {
          DEFAULT: "var(--danger)",
          soft: "var(--danger-bg)",
        },
        warning: {
          DEFAULT: "var(--warning)",
          soft: "var(--warning-bg)",
        },
        success: {
          DEFAULT: "var(--success)",
          soft: "var(--success-bg)",
        },
        code: {
          DEFAULT: "var(--code-bg)",
          ink: "var(--code-text)",
        },
      },
      fontFamily: {
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
        mono: ["JetBrains Mono", "SF Mono", "monospace"],
      },
      boxShadow: {
        card: "var(--shadow)",
      },
    },
  },
  plugins: [],
};
