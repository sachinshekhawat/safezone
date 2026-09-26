/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/hooks/**/*.{js,ts,jsx,tsx,mdx}',
    './src/store/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Semantic risk palette — keep in sync with riskColor() in src/lib/utils.ts
        risk: {
          critical: '#EF4444',
          high: '#F97316',
          moderate: '#F59E0B',
          low: '#10B981',
          'very-low': '#06B6D4',
        },
        brand: {
          DEFAULT: '#4F46E5',
          dark: '#4338CA',
        },
      },
      keyframes: {
        'sos-pulse': {
          '0%, 100%': {
            transform: 'scale(1)',
            boxShadow: '0 0 0 0 rgba(239, 68, 68, 0.7)',
          },
          '50%': {
            transform: 'scale(1.05)',
            boxShadow: '0 0 0 20px rgba(239, 68, 68, 0)',
          },
        },
      },
      animation: {
        'sos-pulse': 'sos-pulse 2s infinite',
      },
    },
  },
  plugins: [],
};
