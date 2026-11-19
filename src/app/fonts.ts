import localFont from 'next/font/local';

export const displayFont = localFont({
  src: '../assets/fonts/creepster/Creepster-Regular.ttf',
  variable: '--font-display',
  display: 'swap',
  preload: false,
  fallback: ['system-ui', 'sans-serif'],
});
