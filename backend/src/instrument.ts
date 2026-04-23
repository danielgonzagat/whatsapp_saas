import tracer from 'dd-trace';

const ddEnabled = Boolean(process.env.DD_API_KEY || process.env.DATADOG_API_KEY);

if (ddEnabled) {
  tracer.init({
    service: process.env.DD_SERVICE || 'kloel-backend',
    env: process.env.DD_ENV || process.env.NODE_ENV || 'development',
    version: process.env.DD_VERSION || process.env.RAILWAY_GIT_COMMIT_SHA || undefined,
    logInjection: true,
    runtimeMetrics: true,
    profiling: process.env.NODE_ENV === 'production',
    appsec: process.env.NODE_ENV === 'production',
  });
}

import * as Sentry from '@sentry/nestjs';

const dsn = process.env.SENTRY_DSN;
const release =
  process.env.SENTRY_RELEASE ||
  process.env.RAILWAY_GIT_COMMIT_SHA ||
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.GITHUB_SHA;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
  tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0.1),
  release,
});
