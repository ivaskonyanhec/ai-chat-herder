/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,ts,scss}'],
  theme: {
    extend: {
      colors: {
        primary: 'var(--color-primary)',
        'primary-dim': 'var(--color-primary-dim)',
        surface: 'var(--color-surface)',
        'surface-container': 'var(--color-surface-container)',
        'surface-container-low': 'var(--color-surface-container-low)',
        'surface-container-lowest': 'var(--color-surface-container-lowest)',
        'on-surface': 'var(--color-on-surface)',
        'on-surface-variant': 'var(--color-on-surface-variant)',
        outline: 'var(--color-outline)',
        error: 'var(--color-error)',
      },
      borderRadius: {
        slate: 'var(--radius-lg)',
      },
      boxShadow: {
        ambient: 'var(--shadow-ambient)',
      },
      fontFamily: {
        sans: ['var(--font-family)'],
      },
      backgroundImage: {
        nav: 'var(--nav-gradient)',
      },
    },
  },
};
