/**
 * KLOEL observability bootstrap.
 *
 * This file MUST be imported before any other module. It initialises:
 *   - Datadog APM (dd-trace) with Prisma/ioredis/http instrumentation
 *   - Sentry error tracking with release + environment context
 *   - Custom business metrics (dogstatsd)
 *
 * Architecture: this runs once at process start. Guards/interceptors
 * enrich the Sentry scope per-request via observability/sentry-context.ts.
 */
import tracer from 'dd-trace';
import * as Sentry from '@sentry/nestjs';
import { initSentryContext } from './observability/sentry-context';

// ---------------------------------------------------------------------------
// 1. Datadog APM — must init BEFORE any instrumented module is imported
// ---------------------------------------------------------------------------

const ddEnabled = Boolean(process.env.DD_API_KEY || process.env.DATADOG_API_KEY);

if (ddEnabled) {
  tracer.init({
    service: process.env.DD_SERVICE || 'kloel-backend',
    env: process.env.DD_ENV || process.env.NODE_ENV || 'development',
    version: process.env.DD_VERSION || process.env.RAILWAY_GIT_COMMIT_SHA || undefined,

    // Log correlation: inject dd.trace_id / dd.span_id into every log line
    logInjection: true,

    // Runtime metrics: CPU, memory, event loop lag → Datadog dashboard
    runtimeMetrics: true,

    // Profiling (production only — adds ~1% CPU overhead)
    profiling: process.env.NODE_ENV === 'production',

    // Application Security Management (production)
    appsec: process.env.NODE_ENV === 'production',

    // Trace all incoming HTTP requests automatically
    // (NestJS routes, health checks, etc.)
    plugins: false, // we configure per-plugin below for explicit control

    // Client IP resolution for ASM / geolocation
    clientIpHeader: 'x-forwarded-for',
  });

  // Enable specific integrations for fine-grained control
  tracer.use('http', {
    server: {
      // Block 404 health-check noise from Datadog APM traces
      validateStatus: (code: number) => code < 500,
    },
    client: {
      // Trace all outbound HTTP calls (Stripe, Meta, etc.)
    },
  });

  tracer.use('ioredis', {
    // Trace every Redis command (GET/SET/DEL etc.) — low overhead
    enabled: true,
  });

  // Prisma tracing is automatic when dd-trace is loaded before Prisma client
  // No explicit .use('prisma') needed with dd-trace >= 5.x
}

// ---------------------------------------------------------------------------
// 2. Sentry — error tracking with release context
// ---------------------------------------------------------------------------

const dsn = process.env.SENTRY_DSN;
const release =
  process.env.SENTRY_RELEASE ||
  process.env.RAILWAY_GIT_COMMIT_SHA ||
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.GITHUB_SHA;

const isProduction = process.env.NODE_ENV === 'production';

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
  release,

  // Performance: sample 10% of transactions in production, 100% in dev
  tracesSampleRate: isProduction ? Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0.1) : 1.0,

  // Profile 1% of transactions in production to keep costs reasonable
  profilesSampleRate: isProduction ? 0.01 : 0,

  // Session replay: off for backend (frontend handles this)
  // Replays: not applicable for API

  // Automatically capture unhandled promise rejections
  attachStacktrace: true,

  // Send personal data? No — mask user PII
  sendDefaultPii: false,

  // Maximum breadcrumbs before oldest are dropped
  maxBreadcrumbs: 100,

  // Deny specific URLs from creating transactions (health checks, etc.)
  denyUrls: [/\/health(\/.*)?$/, /\/api\/pulse\/.*$/],

  // Ignore specific errors that are expected / not actionable
  ignoreErrors: [
    'BadRequestException',
    'NotFoundException',
    'UnauthorizedException',
    'ForbiddenException',
  ],

  // Before sending any event, attach the kloel runtime context
  beforeSend(event) {
    // Drop health-check transactions
    if (event.transaction?.match(/^GET \/health/)) {
      return null;
    }
    return event;
  },
});

// ---------------------------------------------------------------------------
// 3. Initialise the shared kloel context (enriched per-request later)
// ---------------------------------------------------------------------------

initSentryContext('backend');

process.on('unhandledRejection', (reason) => {
  console.error('[KLOEL] unhandledRejection:', reason);
  Sentry.captureException(reason, {
    tags: { type: 'backend_alert', operation: 'unhandled_rejection' },
    level: 'fatal',
  });
});
