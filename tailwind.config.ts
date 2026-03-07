import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: '#0A0A0F',
          secondary: '#12121A',
        },
        border: {
          default: '#1E1E2E',
        },
        text: {
          primary: '#E8E8F0',
          secondary: '#6B6B8A',
        },
        brand: '#C8A96E',
        ai: '#3D7EFF',
        danger: '#FF4D6D',
        success: '#2DD4A0',
      },
      fontFamily: {
        serif: ['Noto Serif SC', 'serif'],
        mono: ['JetBrains Mono', 'monospace'],
        sans: ['Noto Sans SC', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
export default config
