import localFont from 'next/font/local';

// The .woff2 files are copied byte-for-byte from frontend/src/app/fonts/.
// See scripts/ops/check-admin-token-parity.mjs for the CI guard.

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
