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
          0: '#111318',
          1: '#181B22',
          2: '#1E222B',
          3: '#252A35',
          4: '#2C3240',
          5: '#353C4C',
        },
        border: {
          subtle: 'rgba(255,255,255,0.07)',
          default: 'rgba(255,255,255,0.10)',
          strong: 'rgba(255,255,255,0.16)',
        },
      },
    },
  },
  plugins: [],
}
