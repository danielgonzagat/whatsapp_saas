/**
 * PULSE Observability Coverage Engine — Scanner Primitives
 *
 * Logging, metrics, tracing, and sentry/error-tracking scanners
 * that statically inspect file contents for observability instrumentation.
 */

import { readFileSafe } from '../parsers/utils';
import {
  deriveZeroValue,
  deriveUnitValue,
} from '../dynamic-reality-kernel/catalog-arithmetic';
import {
  STRUCTURED_LOG_FIELDS,
  containsSimulatedObservabilitySource,
  missingEvidence,
} from './core';
import type { PillarScanResult } from './core';
import type {
  ObservabilityStatus,
  PerFileLoggingEntry,
  LogQuality,
} from '../types.observability-coverage';

// ─── Logging ──────────────────────────────────────────────────────────────────

export function scanForLogging(filePaths: string[]): ObservabilityStatus {
  return scanForLoggingEvidence(filePaths).status;
}

export function scanForLoggingEvidence(filePaths: string[]): PillarScanResult {
  const simulatedFiles: string[] = [];
  const structuredFiles: string[] = [];
  const consoleFiles: string[] = [];

  for (const filePath of filePaths) {
    const content = readFileSafe(filePath);
    if (containsSimulatedObservabilitySource(content)) {
      simulatedFiles.push(filePath);
      continue;
    }
    if (
      /this\.logger\.|Logger\.(log|error|warn|debug|verbose)|new Logger\(|winston\.(info|error|warn|debug|log)|pino\(/m.test(
        content,
      )
    ) {
      structuredFiles.push(filePath);
    }
    if (/console\.(log|error|warn|debug|info)\(/m.test(content)) {
      consoleFiles.push(filePath);
    }
  }

  if (structuredFiles.length > deriveZeroValue()) {
    return {
      status: 'observed',
      sourceKind: 'static_instrumentation',
      source: 'structured logger call',
      reason: 'Structured logging calls are present in capability-owned code.',
      filePaths: structuredFiles,
    };
  }
  if (consoleFiles.length > deriveZeroValue()) {
    return {
      status: 'partial',
      sourceKind: 'static_instrumentation',
      source: 'console logger call',
      reason: 'Only console logging was found in capability-owned code.',
      filePaths: consoleFiles,
    };
  }
  if (simulatedFiles.length > deriveZeroValue()) {
    return {
      status: 'missing',
      sourceKind: 'simulated',
      source: 'simulated observability marker',
      reason: 'Only simulated observability markers were found.',
      filePaths: simulatedFiles,
    };
  }
  return missingEvidence('No logging instrumentation was found.');
}

export function scanForStructuredFields(
  filePaths: string[],
  getContent: (p: string) => string,
): string[] {
  const found = new Set<string>();

  for (const filePath of filePaths) {
    const content = getContent(filePath);

    for (const field of STRUCTURED_LOG_FIELDS) {
      const re = new RegExp(`(?:log|error|warn|debug|info|verbose)\\s*\\([^)]*\\b${field}\\b`, 'm');
      if (re.test(content)) {
        found.add(field);
      }
    }
  }

  return [...found];
}

export function scanPerFileLogging(
  filePaths: string[],
  getContent: (p: string) => string,
): PerFileLoggingEntry[] {
  return filePaths.map((filePath) => {
    const content = getContent(filePath);

    const hasStructured =
      /this\.logger\.|Logger\.(log|error|warn|debug|verbose)|new Logger\(|winston\.|pino\(/m.test(
        content,
      );

    const hasConsole = /console\.(log|error|warn|debug|info|trace)\(/m.test(content);

    const hasErrorLogging =
      /Logger\.(error|warn)\(|\.logger\.(error|warn)\(|console\.error\(|console\.warn\(|Sentry\.captureException\(|Sentry\.captureMessage\(/m.test(
        content,
      );

    const noLogging =
      !hasStructured &&
      !hasConsole &&
      !/Logger\.|logger\.|console\.|winston|pino|Sentry/.test(content);

    const structuredFieldsFound = STRUCTURED_LOG_FIELDS.filter((field) => {
      const re = new RegExp(`(?:log|error|warn|debug|info|verbose)\\s*\\([^)]*\\b${field}\\b`, 'm');
      return re.test(content);
    });

    const hasTracing =
      /@Span\(|tracer\.startSpan|tracer\.trace|span\.setTag|span\.finish|opentelemetry|startSpan\(|trace\.getTracer\(/m.test(
        content,
      );

    const hasSentry =
      /Sentry\.(captureException|captureMessage|init|addBreadcrumb)|@Sentry\(|initSentry|from ['"]@sentry\//m.test(
        content,
      );

    return {
      filePath,
      hasStructured,
      hasConsole,
      hasErrorLogging,
      noLogging,
      structuredFieldsFound,
      hasTracing,
      hasSentry,
    };
  });
}

export function computeLogQuality(
  logs: ObservabilityStatus,
  tracing: ObservabilityStatus,
  sentry: ObservabilityStatus,
  structuredFieldsCount: number,
): LogQuality {
  const hasSpans = tracing === 'observed';
  const hasStructuredlogs = logs === 'observed';
  const hasAlerts = sentry === 'observed';
  const hasConsoleLogs = logs === 'partial';

  if (hasSpans && hasStructuredlogs && hasAlerts) return 'comprehensive';
  if (hasStructuredlogs && structuredFieldsCount >= deriveUnitValue() + deriveUnitValue())
    return 'comprehensive';
  if (hasStructuredlogs) return 'adequate';
  if (hasConsoleLogs || (hasSpans && !hasStructuredlogs)) return 'minimal';
  return 'none';
}

// ─── Metrics ──────────────────────────────────────────────────────────────────

export function scanForMetrics(filePaths: string[]): ObservabilityStatus {
  return scanForMetricsEvidence(filePaths).status;
}

export function scanForMetricsEvidence(filePaths: string[]): PillarScanResult {
  const instrumentedFiles: string[] = [];
  const configurationFiles: string[] = [];
  const simulatedFiles: string[] = [];

  for (const filePath of filePaths) {
    const content = readFileSafe(filePath);
    if (containsSimulatedObservabilitySource(content)) {
      simulatedFiles.push(filePath);
      continue;
    }
    if (
      /@Metric\(|counter\.(inc|add|set)|histogram\.(observe|record)|gauge\.(inc|dec|set)|summary\.observe|statsd\.(increment|histogram|gauge)|otel\.metrics|meter\.create(Counter|Histogram|Gauge)/m.test(
        content,
      )
    ) {
      instrumentedFiles.push(filePath);
    } else if (/prom\.client|dd-trace\/metrics|import.*datadog|PROMETHEUS_|DD_/m.test(content)) {
      configurationFiles.push(filePath);
    }
  }

  if (instrumentedFiles.length > deriveZeroValue()) {
    return {
      status: 'observed',
      sourceKind: 'static_instrumentation',
      source: 'metric instrumentation call',
      reason: 'Metric emitters are present in capability-owned code.',
      filePaths: instrumentedFiles,
    };
  }
  if (configurationFiles.length > deriveZeroValue()) {
    return {
      status: 'partial',
      sourceKind: 'configuration',
      source: 'metrics configuration',
      reason: 'Metrics configuration exists, but no metric emission was found for this capability.',
      filePaths: configurationFiles,
    };
  }
  if (simulatedFiles.length > deriveZeroValue()) {
    return {
      status: 'missing',
      sourceKind: 'simulated',
      source: 'simulated observability marker',
      reason: 'Only simulated metrics evidence was found.',
      filePaths: simulatedFiles,
    };
  }
  return missingEvidence('No metrics instrumentation was found.');
}

// ─── Tracing ──────────────────────────────────────────────────────────────────

export function scanForTracing(filePaths: string[]): ObservabilityStatus {
  return scanForTracingEvidence(filePaths).status;
}

export function scanForTracingEvidence(filePaths: string[]): PillarScanResult {
  const instrumentedFiles: string[] = [];
  const configurationFiles: string[] = [];
  const simulatedFiles: string[] = [];

  for (const filePath of filePaths) {
    const content = readFileSafe(filePath);
    if (containsSimulatedObservabilitySource(content)) {
      simulatedFiles.push(filePath);
      continue;
    }
    if (
      /@Span\(|tracer\.startSpan|tracer\.trace|span\.setTag|span\.finish|span\.log|withSpan\(|context\.with\(|startSpan\(|trace\.getTracer\(/m.test(
        content,
      )
    ) {
      instrumentedFiles.push(filePath);
    } else if (/dd-trace|otel\.trace|OpentelemetryModule|opentelemetry.*trace/m.test(content)) {
      configurationFiles.push(filePath);
    }
  }

  if (instrumentedFiles.length > deriveZeroValue()) {
    return {
      status: 'observed',
      sourceKind: 'static_instrumentation',
      source: 'trace span instrumentation',
      reason: 'Trace spans are created in capability-owned code.',
      filePaths: instrumentedFiles,
    };
  }
  if (configurationFiles.length > deriveZeroValue()) {
    return {
      status: 'partial',
      sourceKind: 'configuration',
      source: 'tracing configuration',
      reason: 'Tracing configuration exists, but no capability-owned span was found.',
      filePaths: configurationFiles,
    };
  }
  if (simulatedFiles.length > deriveZeroValue()) {
    return {
      status: 'missing',
      sourceKind: 'simulated',
      source: 'simulated observability marker',
      reason: 'Only simulated tracing evidence was found.',
      filePaths: simulatedFiles,
    };
  }
  return missingEvidence('No tracing instrumentation was found.');
}

// ─── Error Tracking ───────────────────────────────────────────────────────────

export function scanForErrorTracking(filePaths: string[]): ObservabilityStatus {
  return scanForErrorTrackingEvidence(filePaths).status;
}

export function scanForErrorTrackingEvidence(filePaths: string[]): PillarScanResult {
  const instrumentedFiles: string[] = [];
  const configurationFiles: string[] = [];
  const simulatedFiles: string[] = [];

  for (const filePath of filePaths) {
    const content = readFileSafe(filePath);
    if (containsSimulatedObservabilitySource(content)) {
      simulatedFiles.push(filePath);
      continue;
    }
    if (
      /@Sentry\(|Sentry\.(captureException|captureMessage|addBreadcrumb)|SentryInterceptor/m.test(
        content,
      )
    ) {
      instrumentedFiles.push(filePath);
    } else if (/Sentry\.(init)|initSentry|SentryModule|from ['"]@sentry\//m.test(content)) {
      configurationFiles.push(filePath);
    }
  }

  if (instrumentedFiles.length > deriveZeroValue()) {
    return {
      status: 'observed',
      sourceKind: 'static_instrumentation',
      source: 'error capture instrumentation',
      reason: 'Error capture calls are present in capability-owned code.',
      filePaths: instrumentedFiles,
    };
  }
  if (configurationFiles.length > deriveZeroValue()) {
    return {
      status: 'partial',
      sourceKind: 'configuration',
      source: 'sentry configuration',
      reason:
        'Sentry configuration exists, but no error capture call was found for this capability.',
      filePaths: configurationFiles,
    };
  }
  if (simulatedFiles.length > deriveZeroValue()) {
    return {
      status: 'missing',
      sourceKind: 'simulated',
      source: 'simulated observability marker',
      reason: 'Only simulated error-tracking evidence was found.',
      filePaths: simulatedFiles,
    };
  }
  return missingEvidence('No error-tracking instrumentation was found.');
}
