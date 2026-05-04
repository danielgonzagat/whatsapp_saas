import { readFileSafe } from '../../parsers/utils';
import { containsSimulatedObservabilitySource, missingEvidence } from './types-and-utils';
import type { PillarScanResult } from './types-and-utils';
import type { ObservabilityStatus } from '../../types.observability-coverage';

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

  if (instrumentedFiles.length > 0) {
    return {
      status: 'observed',
      sourceKind: 'static_instrumentation',
      source: 'metric instrumentation call',
      reason: 'Metric emitters are present in capability-owned code.',
      filePaths: instrumentedFiles,
    };
  }
  if (configurationFiles.length > 0) {
    return {
      status: 'partial',
      sourceKind: 'configuration',
      source: 'metrics configuration',
      reason: 'Metrics configuration exists, but no metric emission was found for this capability.',
      filePaths: configurationFiles,
    };
  }
  if (simulatedFiles.length > 0) {
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

  if (instrumentedFiles.length > 0) {
    return {
      status: 'observed',
      sourceKind: 'static_instrumentation',
      source: 'trace span instrumentation',
      reason: 'Trace spans are created in capability-owned code.',
      filePaths: instrumentedFiles,
    };
  }
  if (configurationFiles.length > 0) {
    return {
      status: 'partial',
      sourceKind: 'configuration',
      source: 'tracing configuration',
      reason: 'Tracing configuration exists, but no capability-owned span was found.',
      filePaths: configurationFiles,
    };
  }
  if (simulatedFiles.length > 0) {
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

  if (instrumentedFiles.length > 0) {
    return {
      status: 'observed',
      sourceKind: 'static_instrumentation',
      source: 'error capture instrumentation',
      reason: 'Error capture calls are present in capability-owned code.',
      filePaths: instrumentedFiles,
    };
  }
  if (configurationFiles.length > 0) {
    return {
      status: 'partial',
      sourceKind: 'configuration',
      source: 'sentry configuration',
      reason:
        'Sentry configuration exists, but no error capture call was found for this capability.',
      filePaths: configurationFiles,
    };
  }
  if (simulatedFiles.length > 0) {
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
