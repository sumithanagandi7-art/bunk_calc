/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#8B5CF6',
          50:  '#F5F3FF',
          100: '#EDE9FE',
          200: '#DDD6FE',
          300: '#C4B5FD',
          400: '#A78BFA',
          500: '#8B5CF6',
          600: '#7C3AED',
          700: '#6D28D9',
          800: '#5B21B6',
        },
        accent: {
          DEFAULT: '#FBBF24',
          50:  '#FFFBEB',
          100: '#FEF3C7',
          200: '#FDE68A',
          300: '#FCD34D',
          400: '#FBBF24',
          500: '#F59E0B',
          600: '#D97706',
        },
        dark: {
          DEFAULT: '#111827',
          50:  '#F9FAFB',
          100: '#F3F4F6',
          200: '#E5E7EB',
          300: '#D1D5DB',
        },
      },
      fontFamily: {
        sans:    ['Nunito', 'Quicksand', 'system-ui', 'sans-serif'],
        display: ['Nunito', 'sans-serif'],
        body:    ['Quicksand', 'sans-serif'],
        marker:  ['Permanent Marker', 'cursive'],
      },
      boxShadow: {
        soft:         '0 10px 25px rgba(0, 0, 0, 0.05)',
        'soft-hover': '0 15px 35px rgba(0, 0, 0, 0.1)',
        glow:         '0 0 20px rgba(139, 92, 246, 0.3)',
      },
      animation: {
        float:       'float 6s ease-in-out infinite',
        wobble:      'wobble 3s ease-in-out infinite',
        wiggle:      'wiggle 1s ease-in-out infinite',
      },
      keyframes: {
        float:  { '0%,100%': { transform: 'translateY(0px)' }, '50%': { transform: 'translateY(-15px)' } },
        wobble: { '0%,100%': { transform: 'rotate(-3deg)' }, '50%': { transform: 'rotate(3deg)' } },
        wiggle: { '0%, 100%': { transform: 'rotate(-3deg)' }, '50%': { transform: 'rotate(3deg)' } },
      },
    },
  },
  plugins: [],
};
