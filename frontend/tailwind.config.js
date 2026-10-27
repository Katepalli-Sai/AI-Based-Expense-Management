/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        navy: { 900: '#0B1F4B', 800: '#10296A', 700: '#1E3A8A' },
        brand: { 50: '#EFF6FF', 100: '#DBEAFE', 500: '#3B82F6', 600: '#2563EB', 700: '#1D4ED8' },
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'] },
    },
  },
  plugins: [],
}
