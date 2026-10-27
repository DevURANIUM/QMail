/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      // Semantic tokens defined as CSS variables in style.css so the whole
      // app re-themes from a single :root / .dark block.
      colors: {
        page: 'var(--c-page)',
        surface: {
          DEFAULT: 'var(--c-surface)',
          2: 'var(--c-surface-2)',
        },
        ink: {
          DEFAULT: 'var(--c-ink)',
          2: 'var(--c-ink-2)',
          3: 'var(--c-ink-3)',
        },
        edge: {
          DEFAULT: 'var(--c-edge)',
          2: 'var(--c-edge-2)',
        },
        accent: {
          DEFAULT: 'var(--c-accent)',
          hover: 'var(--c-accent-hover)',
          soft: 'var(--c-accent-soft)',
          ink: 'var(--c-accent-ink)',
        },
        danger: {
          DEFAULT: 'var(--c-danger)',
          soft: 'var(--c-danger-soft)',
        },
        success: {
          DEFAULT: 'var(--c-success)',
          soft: 'var(--c-success-soft)',
        },
        warning: {
          DEFAULT: 'var(--c-warning)',
          soft: 'var(--c-warning-soft)',
        },
      },
      fontFamily: {
        display: ['"Vazirmatn Variable"', '"Segoe UI Variable Display"', '"Segoe UI"', 'system-ui', 'sans-serif'],
        sans: ['"Vazirmatn Variable"', 'system-ui', '-apple-system', '"Segoe UI"', 'Roboto', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      boxShadow: {
        card: '0 4px 24px rgba(23, 43, 77, 0.035)',
        pop: '0 4px 12px rgba(11, 11, 11, 0.10), 0 12px 32px rgba(11, 11, 11, 0.12)',
      },
    },
  },
  plugins: [],
}
