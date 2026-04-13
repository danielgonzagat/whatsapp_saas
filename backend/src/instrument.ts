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
