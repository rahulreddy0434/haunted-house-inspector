import localFont from 'next/font/local';

export const displayFont = localFont({
  src: '../assets/fonts/creepster/Creepster-Regular.ttf',
  variable: '--font-display',
  display: 'swap',
  preload: false,
  fallback: ['system-ui', 'sans-serif'],
});

export const bodyFont = localFont({
  src: [{ path: '../assets/fonts/inter/Inter-Variable.ttf', weight: '400 700', style: 'normal' }],
  variable: '--font-body',
  display: 'swap',
  fallback: ['system-ui', 'sans-serif'],
});
