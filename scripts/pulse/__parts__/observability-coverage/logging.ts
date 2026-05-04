import { readFileSafe } from '../../parsers/utils';
import { containsSimulatedObservabilitySource, missingEvidence } from './types-and-utils';
import type { PillarScanResult } from './types-and-utils';
import type {
  ObservabilityStatus,
  LogQuality,
  PerFileLoggingEntry,
} from '../../types.observability-coverage';

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

  if (structuredFiles.length > 0) {
    return {
      status: 'observed',
      sourceKind: 'static_instrumentation',
      source: 'structured logger call',
      reason: 'Structured logging calls are present in capability-owned code.',
      filePaths: structuredFiles,
    };
  }
  if (consoleFiles.length > 0) {
    return {
      status: 'partial',
      sourceKind: 'static_instrumentation',
      source: 'console logger call',
      reason: 'Only console logging was found in capability-owned code.',
      filePaths: consoleFiles,
    };
  }
  if (simulatedFiles.length > 0) {
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

const STRUCTURED_LOG_FIELDS = [
  'workspaceId',
  'userId',
  'externalId',
  'operation',
  'status',
  'durationMs',
  'errorCode',
  'requestId',
  'traceId',
  'spanId',
] as const;

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
  if (hasStructuredlogs && structuredFieldsCount >= 2) return 'comprehensive';
  if (hasStructuredlogs) return 'adequate';
  if (hasConsoleLogs || (hasSpans && !hasStructuredlogs)) return 'minimal';
  return 'none';
}
