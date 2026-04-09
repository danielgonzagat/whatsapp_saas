import path from 'path';
import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

// Wave 3 P6.5-2 / I19 — API Base URL Must Be Explicit in Production.
//
// Fail the build if NEXT_PUBLIC_API_URL is missing for a production
// build. This catches the misconfiguration BEFORE the bundle is
// produced — operators see the error in CI/Vercel build logs instead
// of users hitting 401/502 in the rendered app. Pairs with the
// runtime fail-fast in frontend/src/lib/http.ts.
//
// Dev builds (NODE_ENV !== 'production') still allow the env var to
// be unset; the http.ts module falls back to localhost:3001 in that
// case so a hot-reload loop without .env.local works.
if (process.env.NODE_ENV === 'production' && !process.env.NEXT_PUBLIC_API_URL) {
  throw new Error(
    'NEXT_PUBLIC_API_URL must be set at build time for production builds. ' +
      'Configure it in your hosting provider (Vercel project env vars) ' +
      'before triggering the production build.',
  );
}

const nextConfig: NextConfig = {
  reactCompiler: true,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
      { protocol: 'http', hostname: 'localhost' },
    ],
  },
  turbopack: {
    // Pin root to avoid lockfile ambiguity across monorepo
    root: path.join(__dirname, '..'),
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin-allow-popups',
          },
        ],
      },
    ];
  },
};

const sentryBuildPluginEnabled = process.env.KLOEL_ENABLE_SENTRY_BUILD === 'true';

export default sentryBuildPluginEnabled
  ? withSentryConfig(nextConfig, {
      silent: true,
      org: 'kloel-inteligencia-comercial-a',
      project: 'javascript-nextjs',
    })
  : nextConfig;
