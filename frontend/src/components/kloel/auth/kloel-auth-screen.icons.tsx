// SVG icon components for the auth screen.
// No 'use client' needed — these are pure render functions with no hooks.
import { kloelT } from '@/lib/i18n/t';
import { UI } from '@/lib/ui-tokens';

export function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="UI.error"
        d={kloelT(
          `M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z`,
        )}
      />
      <path
        fill="UI.info"
        d={kloelT(
          `M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z`,
        )}
      />
      <path
        fill="UI.warning"
        d={kloelT(
          `M10.53 28.59a14.5 14.5 0 0 1 0-9.18l-7.98-6.19a24.01 24.01 0 0 0 0 21.56l7.98-6.19z`,
        )}
      />
      <path
        fill="UI.success"
        d={kloelT(
          `M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z`,
        )}
      />
    </svg>
  );
}

export function AppleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill={UI.text} aria-hidden="true">
      <path
        d={kloelT(
          `M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z`,
        )}
      />
    </svg>
  );
}

export function FacebookIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill={UI.text} aria-hidden="true">
      <path
        d={kloelT(
          `M13.52 22v-8h2.7l.4-3.2h-3.1V8.76c0-.93.25-1.56 1.58-1.56H16.8V4.34A22.5 22.5 0 0 0 14.33 4c-2.45 0-4.13 1.5-4.13 4.25v2.55H7.4V14h2.8v8h3.32Z`,
        )}
      />
    </svg>
  );
}

export function TikTokIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill={UI.text} aria-hidden="true">
      <path
        d={kloelT(
          `M14.4 3.5c.58 1.62 1.57 2.75 3.08 3.48.74.35 1.55.56 2.47.63v3.04a8.6 8.6 0 0 1-3.1-.63v5.34c0 3.65-2.74 6.14-6.29 6.14S4.5 18.93 4.5 15.58c0-3.56 2.85-6.12 6.41-6.12.38 0 .76.03 1.12.1v3.1a3.9 3.9 0 0 0-1.12-.16c-1.77 0-3.19 1.23-3.19 3.03 0 1.72 1.35 2.95 3.02 2.95 1.95 0 3.04-1.3 3.04-3.4V3.5h2.62z`,
        )}
      />
    </svg>
  );
}

export function EyeIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="UI.tertiary"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={kloelT(`M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z`)} />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function EyeOffIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="UI.tertiary"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path
        d={kloelT(
          `M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94`,
        )}
      />
      <path d={kloelT(`M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19`)} />
      <line x1="1" y1="1" x2="23" y2="23" />
      <path d={kloelT(`M14.12 14.12a3 3 0 1 1-4.24-4.24`)} />
    </svg>
  );
}
