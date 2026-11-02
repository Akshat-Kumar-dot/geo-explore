/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Themed through CSS variables (src/index.css) so dark mode is one class on <html>.
      colors: {
        canvas: 'rgb(var(--c-canvas) / <alpha-value>)',
        surface: 'rgb(var(--c-surface) / <alpha-value>)',
        surfaceAlt: 'rgb(var(--c-surfaceAlt) / <alpha-value>)',
        bubble: 'rgb(var(--c-bubble) / <alpha-value>)',
        line: 'rgb(var(--c-line) / <alpha-value>)',
        lineStrong: 'rgb(var(--c-lineStrong) / <alpha-value>)',
        lineSoft: 'rgb(var(--c-lineSoft) / <alpha-value>)',
        ink: 'rgb(var(--c-ink) / <alpha-value>)',
        ink2: 'rgb(var(--c-ink2) / <alpha-value>)',
        muted: 'rgb(var(--c-muted) / <alpha-value>)',
        muted2: 'rgb(var(--c-muted2) / <alpha-value>)',
        body: 'rgb(var(--c-body) / <alpha-value>)',
        brand: 'rgb(var(--c-brand) / <alpha-value>)',
        accent: 'rgb(var(--c-accent) / <alpha-value>)',
        danger: 'rgb(var(--c-danger) / <alpha-value>)',
        rail: 'rgb(var(--c-rail) / <alpha-value>)',
        teal: 'rgb(var(--c-teal) / <alpha-value>)',
        panel: 'rgb(var(--c-panel) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'Segoe UI', 'Arial', 'sans-serif'],
        serif: ['"Source Serif 4"', 'Charter', 'Georgia', 'serif'],
      },
      boxShadow: {
        card: '0 1px 3px rgba(23,32,51,.08)',
        float: '0 4px 16px rgba(23,32,51,.16)',
      },
    },
  },
  plugins: [],
}
