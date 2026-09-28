/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Paleta principal — Violeta suave (violet-500 base)
        brand: {
          50:  '#f5f3ff',
          100: '#ede9fe',
          200: '#ddd6fe',
          300: '#c4b5fd',
          400: '#a78bfa',
          500: '#8b5cf6',
          600: '#7c3aed',
          700: '#6d28d9',
          800: '#5b21b6',
          900: '#4c1d95',
          950: '#2e1065',
          DEFAULT: '#8b5cf6',
          dark:    '#7c3aed',
          light:   '#a78bfa',
          accent:  '#f59e0b',
        },
        // Ámbar — color de acción secundaria
        accent: {
          50:  '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
          800: '#92400e',
          900: '#78350f',
          DEFAULT: '#f59e0b',
        },
        // Superficies dark — Zinc cálido
        surface: {
          light:       '#ffffff',
          dark:        '#27272a',
          canvasLight: '#f4f5f9',
          canvasDark:  '#18181b',
          cardDark:    '#27272a',
          borderDark:  '#3f3f46',
        },
        // Extensiones de slate
        slate: {
          750: '#293548',
          850: '#172033',
          925: '#0d1220',
          950: '#090e1a',
        }
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif']
      },
      backgroundImage: {
        'sidebar-gradient': 'linear-gradient(180deg, #27272a 0%, #18181b 60%, #09090b 100%)',
        'brand-gradient':   'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 50%, #6d28d9 100%)',
        'hero-gradient':    'linear-gradient(135deg, #7c3aed 0%, #8b5cf6 40%, #1e1b4b 100%)',
        'card-gradient':    'linear-gradient(145deg, rgba(139,92,246,0.08) 0%, transparent 60%)',
      },
      boxShadow: {
        'brand':     '0 4px 24px -4px rgba(139, 92, 246, 0.35)',
        'brand-lg':  '0 8px 40px -8px rgba(139, 92, 246, 0.45)',
        'accent':    '0 4px 24px -4px rgba(245, 158, 11, 0.35)',
        'card-dark': '0 2px 16px rgba(0,0,0,0.35)',
      },
      animation: {
        'fade-in':   'fadeIn 0.2s ease-out',
        'slide-up':  'slideUp 0.25s ease-out',
        'pulse-soft':'pulseSoft 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn:   { from: { opacity: 0 }, to: { opacity: 1 } },
        slideUp:  { from: { opacity: 0, transform: 'translateY(8px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
        pulseSoft:{ '0%,100%': { opacity: 1 }, '50%': { opacity: 0.6 } },
      }
    },
  },
  plugins: [],
}
