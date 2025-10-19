import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-inter)', 'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
      },
      colors: {
        brand: {
          DEFAULT: '#4E5BFF',
          light: '#7B5CFF',
          accent: '#38C9C9',
          muted: '#EEF0FF',
          background: '#F6F7FB',
          surface: '#FFFFFF'
        },
      },
      boxShadow: {
        card: '0 20px 40px rgba(78, 91, 255, 0.08)',
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg, #7B5CFF 0%, #4E5BFF 100%)',
      },
    },
  },
  plugins: [],
}
export default config
