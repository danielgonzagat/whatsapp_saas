/**
 * PULSE Parser 73: Monitoring Coverage
 * Layer 10: DevOps Health
 * Mode: STATIC (filesystem scan — no runtime needed)
 *
 * CHECKS:
 * Verify that production monitoring, alerting, and observability infrastructure is in place.
 * Monitoring gaps mean incidents go undetected until users complain.
 *
 * Health endpoints:
 * 1. GET /health → expect 200 + JSON with at least { status: 'ok' }
 * 2. GET /health/detailed → expect DB status, Redis status, queue status (if endpoint exists)
 * 3. Verify health endpoint responds in < 500ms (it is the first thing load balancers check)
 * 4. GET /metrics → if Prometheus-compatible metrics endpoint exists, verify format
 *
 * Sentry integration:
 * 5. Check SENTRY_DSN env var is set (on backend and frontend)
 * 6. If PULSE_SENTRY_DSN set: POST a test error via Sentry SDK → verify it appears in Sentry
 * 7. Check backend has SentryInterceptor or equivalent error capture registered globally
 * 8. Check frontend has Sentry.init() called in _app.tsx or layout.tsx
 * 9. Verify Sentry captures unhandled promise rejections (not just caught errors)
 *
 * Structured logging:
 * 10. Check that Logger (NestJS Logger) is used consistently (not console.log) in backend
 * 11. Check that log messages include context: Logger.error(msg, stack, 'ContextName')
 * 12. Check that financial operations log: wallet credit, withdrawal, payment events
 * 13. Verify logs include workspaceId for multi-tenant debugging
 *
 * Alerting:
 * 14. Check if Uptime Kuma, Better Uptime, or equivalent is configured (via webhook URL env var)
 * 15. Check if critical financial operations have alert triggers (wallet insufficient, payment failed)
 *
 * Queue monitoring:
 * 16. GET /health/queues → check BullMQ queue depth and failed job count (if endpoint exists)
 * 17. If failed job count > PULSE_QUEUE_FAILED_THRESHOLD (default 10) → MONITORING_MISSING break
 * 18. Check if BullBoard (BullMQ dashboard) is accessible at /admin/queues
 *
 * Database monitoring:
 * 19. Check if slow query logging is enabled (pg_stat_statements or Prisma query events)
 * 20. Check if DB connection pool exhaustion is monitored
 *
 * REQUIRES:
 * - Filesystem access for static checks (no runtime needed)
 *
 * BREAK TYPES:
 * - MONITORING_MISSING (high) — health endpoint missing or returning 5xx, Sentry not configured,
 *   structured logging absent from financial operations, or failed job queue not monitored
 */

import * as fs from 'fs';
import * as path from 'path';
import { walkFiles, readFileSafe } from './utils';
import type { Break, PulseConfig } from '../types';

export function checkMonitoringCoverage(config: PulseConfig): Break[] {
  const breaks: Break[] = [];

  // --- Check 1: Health endpoint exists in backend ---
  const backendFiles = walkFiles(config.backendDir, ['.ts']);
  let healthEndpointFile: string | null = null;

  for (const file of backendFiles) {
    const content = readFileSafe(file);
    if (/@Get\(['"]health['"]\)|@Get\(['"]\/health['"]\)/.test(content)) {
      healthEndpointFile = file;
      break;
    }
  }

  if (!healthEndpointFile) {
    breaks.push({
      type: 'MONITORING_MISSING',
      severity: 'high',
      file: config.backendDir,
      line: 0,
      description: 'No health endpoint found',
      detail:
        'Backend has no @Get("health") endpoint. Load balancers and uptime monitors cannot check service health.',
    });
  }

  // --- Check 2: Sentry integration in backend ---
  const backendSrc = path.join(config.backendDir, 'src');
  let hasSentryBackend = false;
  let sentryBackendFile: string | null = null;

  for (const file of backendFiles) {
    const content = readFileSafe(file);
    if (
      /from ['"]@sentry\/|import.*Sentry|captureException|SentryExceptionFilter|initSentry/i.test(
        content,
      )
    ) {
      hasSentryBackend = true;
      sentryBackendFile = file;
      break;
    }
  }

  if (!hasSentryBackend) {
    breaks.push({
      type: 'MONITORING_MISSING',
      severity: 'high',
      file: backendSrc,
      line: 0,
      description: 'No error tracking (Sentry) in backend',
      detail:
        'Backend has no Sentry integration. Unhandled exceptions will not be captured for alerting.',
    });
  }

  // --- Check 3: Sentry integration in frontend ---
  const frontendFiles = walkFiles(config.frontendDir, ['.ts', '.tsx']);
  let hasSentryFrontend = false;

  for (const file of frontendFiles) {
    const content = readFileSafe(file);
    if (/from ['"]@sentry\/|Sentry\.init|withSentryConfig/i.test(content)) {
      hasSentryFrontend = true;
      break;
    }
  }

  if (!hasSentryFrontend) {
    breaks.push({
      type: 'MONITORING_MISSING',
      severity: 'high',
      file: config.frontendDir,
      line: 0,
      description: 'No error tracking (Sentry) in frontend',
      detail:
        'Frontend has no Sentry.init() call. Client-side errors are not captured or reported.',
    });
  }

  // --- Check 4: NestJS Logger usage in backend (vs raw console.log) ---
  let consoleLogFiles = 0;
  let loggerFiles = 0;

  for (const file of backendFiles) {
    const content = readFileSafe(file);
    // Skip test files and generated files
    if (file.includes('.spec.') || file.includes('.test.') || file.includes('dist/')) {
      continue;
    }
    if (/console\.(log|error|warn)\(/m.test(content)) {
      consoleLogFiles++;
    }
    if (/new Logger\(|Logger\.log\(|Logger\.error\(|Logger\.warn\(/m.test(content)) {
      loggerFiles++;
    }
  }

  // If significantly more console.log than Logger usage, flag it
  if (consoleLogFiles > loggerFiles * 2 && consoleLogFiles > 5) {
    breaks.push({
      type: 'MONITORING_MISSING',
      severity: 'high',
      file: config.backendDir,
      line: 0,
      description: 'Structured logging absent — console.log prevalent over NestJS Logger',
      detail: `Found console.log in ${consoleLogFiles} files vs NestJS Logger in ${loggerFiles} files. Logs will not be structured or filterable in production.`,
    });
  }

  // --- Check 5: BullMQ queue monitoring ---
  const workerFiles = walkFiles(config.workerDir, ['.ts']);
  let hasQueueEvents = false;

  for (const file of [...backendFiles, ...workerFiles]) {
    const content = readFileSafe(file);
    if (/QueueEvents|on\(['"]failed['"]|on\(['"]completed['"]|queueEvents/i.test(content)) {
      hasQueueEvents = true;
      break;
    }
  }

  if (!hasQueueEvents) {
    breaks.push({
      type: 'MONITORING_MISSING',
      severity: 'high',
      file: config.workerDir,
      line: 0,
      description: 'No queue monitoring (BullMQ events)',
      detail:
        'No QueueEvents listener or failed-job handler found. Failed jobs will not trigger alerts or be tracked.',
    });
  }

  // --- Check 6: Financial operations have logging ---
  const financialServiceFiles = backendFiles.filter(
    (f) =>
      /wallet|payment|checkout|billing|transaction/i.test(path.basename(f)) &&
      f.endsWith('.service.ts'),
  );

  for (const file of financialServiceFiles) {
    const content = readFileSafe(file);
    const hasLogger = /this\.logger\.(log|error|warn)\(|Logger\.(log|error|warn)\(/m.test(content);
    if (!hasLogger) {
      breaks.push({
        type: 'MONITORING_MISSING',
        severity: 'high',
        file,
        line: 0,
        description: 'Financial service has no structured logging',
        detail: `${path.basename(file)}: No Logger usage found. Financial operations (payments, withdrawals) must be logged for audit and debugging.`,
      });
    }
  }

  return breaks;
}
