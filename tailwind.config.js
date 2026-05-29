/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Ayres del Sur brand palette
        negro:       "#1A1A1A",
        amarillo:    "#E8A020",
        "amarillo-cl": "#FFF8E8",
        azul:        "#2E6DA8",
        "azul-cl":   "#EBF2FA",
        cream:       "#FAFAF7",
        "cream-dark":"#F0EDE4",
        danger:      "#C62828",
        warning:     "#F57F17",

        // Category colors
        "cat-almacen":    "#5B8C5A",
        "cat-bebidas":    "#2E85C8",
        "cat-alcohol":    "#C4873A",
        "cat-vinos":      "#7B3F6E",
        "cat-perfumeria": "#E07A9A",
        "cat-limpieza":   "#5B7FA6",
        "cat-snacks":     "#C4873A",

        // shadcn/ui semantic tokens (mapped to brand)
        border:      "hsl(var(--border))",
        input:       "hsl(var(--input))",
        ring:        "hsl(var(--ring))",
        background:  "hsl(var(--background))",
        foreground:  "hsl(var(--foreground))",
        primary: {
          DEFAULT:    "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT:    "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT:    "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT:    "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT:    "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT:    "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT:    "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      fontFamily: {
        sans:    ["DM Sans", "Segoe UI", "system-ui", "sans-serif"],
        display: ["Fraunces", "Georgia", "serif"],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      boxShadow: {
        card: "0 1px 4px rgba(0,0,0,0.10), 0 4px 14px rgba(0,0,0,0.09)",
        "card-hover": "0 2px 8px rgba(0,0,0,0.09), 0 8px 24px rgba(0,0,0,0.07)",
        panel: "0 2px 8px rgba(0,0,0,0.09)",
        "panel-lg": "0 4px 20px rgba(0,0,0,0.14)",
      },
    },
  },
  plugins: [],
}
