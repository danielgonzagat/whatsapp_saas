import localFont from 'next/font/local';

/** Sora. */
export const sora = localFont({
  src: [
    {
      path: './fonts/sora-latin.woff2',
      weight: '300 700',
      style: 'normal',
    },
  ],
  variable: '--font-sora',
  display: 'swap',
  fallback: ['system-ui', 'sans-serif'],
});

/** Jetbrains mono. */
export const jetbrainsMono = localFont({
  src: [
    {
      path: './fonts/jetbrains-mono-latin.woff2',
      weight: '400 600',
      style: 'normal',
    },
  ],
  variable: '--font-jetbrains',
  display: 'swap',
  fallback: ['ui-monospace', 'SFMono-Regular', 'monospace'],
});

/** Dm sans. */
export const dmSans = localFont({
  src: [
    {
      path: './fonts/dm-sans-latin.woff2',
      weight: '400 700',
      style: 'normal',
    },
  ],
  variable: '--font-dm-sans',
  display: 'swap',
  fallback: ['system-ui', 'sans-serif'],
});

/** Playfair. */
export const playfair = localFont({
  src: [
    {
      path: './fonts/playfair-display-latin.woff2',
      weight: '400 700',
      style: 'normal',
    },
  ],
  variable: '--font-playfair',
  display: 'swap',
  fallback: ['Georgia', 'Times New Roman', 'serif'],
});
