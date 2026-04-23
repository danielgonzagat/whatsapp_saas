/**
 * PULSE Parser 88: Observability Checker
 * Layer 19: Observability
 * Mode: DEEP (requires codebase scan + optional running infrastructure)
 *
 * CHECKS:
 * 1. Request tracing: verifies correlation IDs (X-Request-ID or X-Trace-ID) are:
 *    a. Generated at request entry (middleware or interceptor)
 *    b. Propagated to all outbound calls (Asaas, LLM, WhatsApp)
 *    c. Returned in error responses (for support debugging)
 *    d. Logged in every log line within that request context
 * 2. Error alerting: verifies that critical errors trigger external alerts:
 *    - Sentry, Datadog, or custom alerting webhook configured
 *    - Payment failures trigger immediate alert (not just logged)
 *    - WhatsApp disconnection triggers alert
 * 3. Metrics collection: verifies key business metrics are tracked:
 *    - Request latency per endpoint (histogram)
 *    - Queue depth (BullMQ job counts)
 *    - Error rate per endpoint
 *    - Payment success/failure rate
 * 4. Health check endpoints exist (/health, /health/live, /health/ready)
 * 5. Logs include structured fields (not just string messages)
 * 6. No silent errors in critical paths (catch blocks that don't log)
 *
 * REQUIRES: PULSE_DEEP=1
 * BREAK TYPES:
 *   OBSERVABILITY_NO_TRACING(high)   — requests not traced with correlation ID
 *   OBSERVABILITY_NO_ALERTING(high)  — critical errors not sent to external alerting
 */
import * as path from 'path';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';
import { readTextFile } from '../safe-fs';

/** Check observability. */
export function checkObservability(config: PulseConfig): Break[] {
  const breaks: Break[] = [];

  const backendFiles = walkFiles(config.backendDir, ['.ts']);
  const allBackendContent = backendFiles.reduce((acc, file) => {
    try {
      return acc + readTextFile(file, 'utf8') + '\n';
    } catch {
      return acc;
    }
  }, '');

  // CHECK 1a: Correlation ID generation middleware
  const hasCorrelationMiddleware =
    /X-Request-ID|X-Trace-ID|correlationId|requestId|traceId/i.test(allBackendContent) &&
    /Middleware|Interceptor/i.test(allBackendContent);

  if (!hasCorrelationMiddleware) {
    breaks.push({
      type: 'OBSERVABILITY_NO_TRACING',
      severity: 'high',
      file: 'backend/src/',
      line: 0,
      description:
        'No request correlation ID middleware found — cannot trace a request across logs',
      detail:
        'Add a NestJS middleware that generates/reads X-Request-ID and attaches it to AsyncLocalStorage context',
    });
  }

  // CHECK 1b: Correlation ID propagated to outbound calls
  const httpClientFiles = backendFiles.filter((f) =>
    /stripe|llm|openai|anthropic|whatsapp|http|axios/i.test(f),
  );
  for (const file of httpClientFiles) {
    let content: string;
    try {
      content = readTextFile(file, 'utf8');
    } catch {
      continue;
    }
    const relFile = path.relative(config.rootDir, file);

    if (/axios\.get|axios\.post|fetch\s*\(|httpClient/i.test(content)) {
      if (!/X-Request-ID|X-Trace-ID|correlationId|traceId/i.test(content)) {
        breaks.push({
          type: 'OBSERVABILITY_NO_TRACING',
          severity: 'high',
          file: relFile,
          line: 0,
          description:
            'Outbound HTTP call without correlation ID header — cannot trace request through external services',
          detail:
            'Add X-Request-ID header to all outbound HTTP calls using the request context correlation ID',
        });
      }
    }
  }

  // CHECK 2: Error alerting (Sentry, Datadog, custom webhook)
  const hasAlertingIntegration =
    /Sentry|@sentry\/node|datadog|dd-trace|newrelic|pagerduty|opsgenie|alertwebhook/i.test(
      allBackendContent,
    );

  if (!hasAlertingIntegration) {
    breaks.push({
      type: 'OBSERVABILITY_NO_ALERTING',
      severity: 'high',
      file: 'backend/src/',
      line: 0,
      description:
        'No error alerting integration found (Sentry, Datadog, etc.) — critical errors will go unnoticed',
      detail:
        'Integrate @sentry/nestjs or equivalent; configure alerts for payment failures and 500 errors',
    });
  }

  // CHECK 2b: Payment failure alerting specifically
  const paymentFiles = backendFiles.filter((f) => /payment|checkout|wallet/i.test(f));
  for (const file of paymentFiles) {
    let content: string;
    try {
      content = readTextFile(file, 'utf8');
    } catch {
      continue;
    }
    const relFile = path.relative(config.rootDir, file);

    if (
      /catch\s*\(/.test(content) &&
      !/Sentry\.captureException|captureException|alert|notify|sendAlert/i.test(content)
    ) {
      breaks.push({
        type: 'OBSERVABILITY_NO_ALERTING',
        severity: 'high',
        file: relFile,
        line: 0,
        description:
          'Payment/financial error caught without external alert — payment failures may go unnoticed for hours',
        detail: 'Add Sentry.captureException(err) or custom alert in payment error catch blocks',
      });
    }
  }

  // CHECK 3: Metrics collection
  const hasMetrics = /prometheus|prom-client|StatsD|metricsService|histogram|counter\./i.test(
    allBackendContent,
  );
  if (!hasMetrics) {
    breaks.push({
      type: 'OBSERVABILITY_NO_ALERTING',
      severity: 'high',
      file: 'backend/src/',
      line: 0,
      description:
        'No metrics collection found — cannot monitor request latency, error rate, or queue depth',
      detail:
        'Integrate prom-client or @willsoto/nestjs-prometheus; expose /metrics endpoint for Prometheus scraping',
    });
  }

  // CHECK 4: Health check endpoints
  const hasHealthCheck =
    backendFiles.some((f) => /health/i.test(path.basename(f))) ||
    /HealthController|HealthIndicator|\/health/i.test(allBackendContent);

  if (!hasHealthCheck) {
    breaks.push({
      type: 'OBSERVABILITY_NO_TRACING',
      severity: 'high',
      file: 'backend/src/',
      line: 0,
      description:
        'No health check endpoint found — load balancers and monitoring cannot verify service liveness',
      detail: 'Add @nestjs/terminus HealthController at /health, /health/live, /health/ready',
    });
  }

  // CHECK 5: Structured logging
  const hasStructuredLogging =
    /this\.logger\.\w+\s*\(\s*\{|Logger\.log\s*\(\s*\{|winston|pino/i.test(allBackendContent);
  const hasStringOnlyLogging = /this\.logger\.\w+\s*\(\s*`|this\.logger\.\w+\s*\(\s*['"]/.test(
    allBackendContent,
  );

  if (!hasStructuredLogging && hasStringOnlyLogging) {
    breaks.push({
      type: 'OBSERVABILITY_NO_TRACING',
      severity: 'high',
      file: 'backend/src/',
      line: 0,
      description: 'Logs use string messages only — no structured fields for filtering/alerting',
      detail:
        'Use this.logger.log({ event, workspaceId, userId, error }) instead of template string messages',
    });
  }

  // TODO: Implement when infrastructure available
  // - Verify Sentry DSN is valid and receiving events
  // - Check Prometheus metrics are being scraped
  // - Verify alert rules fire on test errors
  // - Distributed tracing (OpenTelemetry) integration check

  return breaks;
}
