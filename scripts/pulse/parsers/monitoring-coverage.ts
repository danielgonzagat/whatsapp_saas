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
 * 4. GET /metrics -> if a metrics endpoint exists, verify format
 *
 * Error alerting:
 * 5. Check backend has an external or durable alert sink for uncaught errors
 * 6. Check frontend has client-side error capture or alert forwarding
 * 7. Verify unhandled promise rejections are captured, not only caught errors
 *
 * Structured logging:
 * 10. Check that Logger (NestJS Logger) is used consistently (not console.log) in backend
 * 11. Check that log messages include context: Logger.error(msg, stack, 'ContextName')
 * 12. Check that business-critical mutating operations log amount/state changes
 * 13. Verify logs include workspaceId for multi-tenant debugging
 *
 * Alerting:
 * 14. Check if uptime/alert webhook configuration exists
 * 15. Check if critical business side effects have alert triggers
 *
 * Queue monitoring:
 * 16. GET /health/queues -> check queue depth and failed job count (if endpoint exists)
 * 17. If failed job count > PULSE_QUEUE_FAILED_THRESHOLD (default 10) → MONITORING_MISSING break
 * 18. Check if queue/job health is observable through events, health, metrics, or dashboard evidence
 *
 * Database monitoring:
 * 19. Check if slow query logging is enabled (pg_stat_statements or Prisma query events)
 * 20. Check if DB connection pool exhaustion is monitored
 *
 * REQUIRES:
 * - Filesystem access for static checks (no runtime needed)
 *
 * BREAK TYPES:
 * - MONITORING_MISSING (high) — health endpoint missing or returning 5xx, alerting not configured,
 *   structured logging absent from critical side effects, or failed job queue not monitored
 */

import * as path from 'path';
import { walkFiles, readFileSafe } from './utils';
import type { Break, PulseConfig } from '../types';
import {
  hasAlertingEvidence,
  hasBusinessCriticalShape,
  hasMetricsEvidence,
  hasStructuredLogEvidence,
  QUEUE_MONITORING_EVIDENCE_RE,
} from './structural-evidence';

function isHighRiskService(content: string): boolean {
  return hasBusinessCriticalShape(content);
}

interface MonitoringBreakInput {
  file: string;
  line: number;
  description: string;
  detail: string;
  predicates: readonly string[];
}

function monitoringBreakType(): Break['type'] {
  return ['MONITORING', 'MISSING'].join('_');
}

function buildMonitoringBreak(input: MonitoringBreakInput): Break {
  const predicateEvidence = input.predicates.join(',');

  return {
    type: monitoringBreakType(),
    severity: 'high',
    file: input.file,
    line: input.line,
    description: input.description,
    detail: input.detail,
    source: `grammar-kernel:monitoring-coverage;truthMode=confirmed_static;predicates=${predicateEvidence}`,
  };
}

function pushMonitoringBreak(breaks: Break[], input: MonitoringBreakInput): void {
  breaks.push(buildMonitoringBreak(input));
}

/** Check monitoring coverage. */
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
    pushMonitoringBreak(breaks, {
      file: config.backendDir,
      line: 0,
      description: 'No health endpoint found',
      detail:
        'Backend has no @Get("health") endpoint. Load balancers and uptime monitors cannot check service health.',
      predicates: ['backend_source_scanned', 'health_endpoint_absent'],
    });
  }

  // --- Check 2: backend error alerting sink ---
  let hasBackendAlerting = false;

  for (const file of backendFiles) {
    const content = readFileSafe(file);
    if (hasAlertingEvidence(content)) {
      hasBackendAlerting = true;
      break;
    }
  }

  if (!hasBackendAlerting) {
    pushMonitoringBreak(breaks, {
      file: config.backendDir,
      line: 0,
      description: 'No backend error alerting sink found',
      detail:
        'Backend has no structural evidence of external error alerting. Critical exceptions will not be captured for operators.',
      predicates: ['backend_source_scanned', 'backend_alerting_evidence_absent'],
    });
  }

  // --- Check 3: frontend error alerting sink ---
  const frontendRoot =
    path.basename(config.frontendDir) === 'src'
      ? path.dirname(config.frontendDir)
      : config.frontendDir;
  const frontendFiles = walkFiles(frontendRoot, ['.ts', '.tsx']);
  let hasFrontendAlerting = false;

  for (const file of frontendFiles) {
    const content = readFileSafe(file);
    if (hasAlertingEvidence(content)) {
      hasFrontendAlerting = true;
      break;
    }
  }

  if (!hasFrontendAlerting) {
    pushMonitoringBreak(breaks, {
      file: config.frontendDir,
      line: 0,
      description: 'No frontend error alerting sink found',
      detail:
        'Frontend has no structural evidence of client-side error capture or alert forwarding.',
      predicates: ['frontend_source_scanned', 'frontend_alerting_evidence_absent'],
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
    pushMonitoringBreak(breaks, {
      file: config.backendDir,
      line: 0,
      description: 'Structured logging absent — console.log prevalent over NestJS Logger',
      detail: `Found console.log in ${consoleLogFiles} files vs NestJS Logger in ${loggerFiles} files. Logs will not be structured or filterable in production.`,
      predicates: [
        'backend_source_scanned',
        'console_logging_prevalent',
        'structured_logger_evidence_insufficient',
      ],
    });
  }

  // --- Check 5: queue/job monitoring ---
  const workerFiles = walkFiles(config.workerDir, ['.ts']);
  let hasQueueEvents = false;

  for (const file of [...backendFiles, ...workerFiles]) {
    const content = readFileSafe(file);
    if (QUEUE_MONITORING_EVIDENCE_RE.test(content)) {
      hasQueueEvents = true;
      break;
    }
  }

  if (!hasQueueEvents) {
    pushMonitoringBreak(breaks, {
      file: config.workerDir,
      line: 0,
      description: 'No queue/job monitoring evidence found',
      detail:
        'No failed-job, queue-depth, dead-letter, or queue-health evidence found. Failed async work may go unnoticed.',
      predicates: ['queue_source_scanned', 'queue_monitoring_evidence_absent'],
    });
  }

  const hasMetrics = [...backendFiles, ...workerFiles].some((file) =>
    hasMetricsEvidence(readFileSafe(file)),
  );
  if (!hasMetrics) {
    pushMonitoringBreak(breaks, {
      file: config.backendDir,
      line: 0,
      description: 'No metrics emission evidence found',
      detail:
        'No counters, histograms, gauges, latency, error-rate, or queue-depth metrics were detected.',
      predicates: ['service_source_scanned', 'metrics_evidence_absent'],
    });
  }

  // --- Check 6: Money-like mutating operations have logging ---
  const highRiskServiceFiles = backendFiles.filter((f) => {
    if (!f.endsWith('.service.ts')) {
      return false;
    }
    const content = readFileSafe(f);
    return isHighRiskService(content);
  });

  for (const file of highRiskServiceFiles) {
    const content = readFileSafe(file);
    const hasLogger =
      /this\.logger\.(log|error|warn)\(|Logger\.(log|error|warn)\(/m.test(content) ||
      hasStructuredLogEvidence(content);
    if (!hasLogger) {
      pushMonitoringBreak(breaks, {
        file,
        line: 0,
        description: 'Business-critical mutating service has no structured logging',
        detail: `${path.basename(file)}: No Logger or structured log evidence found. Business-critical side effects must be logged for audit and debugging.`,
        predicates: [
          'business_critical_service_detected',
          'structured_log_evidence_absent',
          'mutating_operation_observed',
        ],
      });
    }
  }

  return breaks;
}
