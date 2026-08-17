/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Bambu Lab color palette
        bambu: {
          green: '#00ae42',
          'green-light': '#00c64d',
          'green-dark': '#009438',
          dark: '#1a1a1a',
          'dark-secondary': '#2d2d2d',
          'dark-tertiary': '#3d3d3d',
          card: '#2d2d2d', // Same as dark-secondary for card backgrounds
          gray: '#808080',
          'gray-light': '#a0a0a0',
          'gray-dark': '#4a4a4a',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(16px) scale(0.98)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        wiggle: {
          '0%, 100%': { transform: 'rotate(-8deg)' },
          '20%': { transform: 'rotate(8deg)' },
          '40%': { transform: 'rotate(-6deg)' },
          '60%': { transform: 'rotate(6deg)' },
          '80%': { transform: 'rotate(-3deg)' },
        },
        'pop-in': {
          '0%': { transform: 'scale(0)', opacity: '0' },
          '70%': { transform: 'scale(1.2)' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
      },
      animation: {
        'fade-in': 'fadeIn 0.15s ease-out',
        'slide-up': 'slideUp 0.2s ease-out',
        'wiggle': 'wiggle 0.6s ease-in-out',
        'pop-in': 'pop-in 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
      },
    },
  },
  plugins: [],
}
