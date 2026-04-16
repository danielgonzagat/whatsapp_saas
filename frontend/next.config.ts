import path from 'node:path';
import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';
import { codecovWebpackPlugin } from '@codecov/webpack-plugin';

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

// Codecov bundle analysis plugin is only active when CODECOV_TOKEN is present
// AND the build runs under webpack (not Turbopack — Next ignores the webpack
// function entirely when Turbopack is the active bundler). Pre-push hook and
// ci-cd.yml both run `next build --webpack`, so bundle stats upload there.
// Local dev without the token is a no-op (plugin is not added to the chain).
const codecovBundleAnalysisEnabled = Boolean(process.env.CODECOV_TOKEN);

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
  webpack: (config) => {
    if (codecovBundleAnalysisEnabled) {
      config.plugins = config.plugins ?? [];
      config.plugins.push(
        codecovWebpackPlugin({
          enableBundleAnalysis: true,
          bundleName: 'whatsapp-saas-frontend',
          uploadToken: process.env.CODECOV_TOKEN,
          // gitService lets the plugin attach commit metadata correctly in
          // CI runs that aren't pulling git state from the workspace.
          gitService: 'github',
        }),
      );
    }
    return config;
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

const sentryBuildPluginEnabled = Boolean(
  process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG && process.env.SENTRY_PROJECT,
);

if (
  process.env.NODE_ENV === 'production' &&
  process.env.NEXT_PUBLIC_SENTRY_DSN &&
  !sentryBuildPluginEnabled
) {
  throw new Error(
    'NEXT_PUBLIC_SENTRY_DSN is configured but Sentry source-map upload is not. ' +
      'Set SENTRY_AUTH_TOKEN, SENTRY_ORG, and SENTRY_PROJECT in Vercel before building.',
  );
}

export default sentryBuildPluginEnabled
  ? withSentryConfig(nextConfig, {
      silent: true,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
    })
  : nextConfig;
