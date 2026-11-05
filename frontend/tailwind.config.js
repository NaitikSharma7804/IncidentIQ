/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: '#0a0d14',
        surface: '#111726',
        'surface-elevated': '#182032',
        border: '#232d42',
        primary: {
          DEFAULT: '#3b82f6',
          hover: '#2563eb',
          light: '#60a5fa',
        },
        success: '#10b981',
        warning: '#f59e0b',
        danger: '#ef4444',
      },
    },
  },
  plugins: [],
}

