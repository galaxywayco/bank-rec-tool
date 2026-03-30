/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Geist', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['Geist Mono', 'ui-monospace', 'monospace'],
      },
      colors: {
        surface: {
          0: '#080B12',
          1: '#0F1420',
          2: '#151C2C',
          3: '#1A2236',
          4: '#1E2842',
          5: '#243050',
        },
        border: {
          subtle: 'rgba(255,255,255,0.06)',
          default: 'rgba(255,255,255,0.08)',
          strong: 'rgba(255,255,255,0.14)',
        },
      },
    },
  },
  plugins: [],
}
