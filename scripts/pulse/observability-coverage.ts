/**
 * PULSE Observability Coverage Engine
 *
 * Static scanner that maps every capability and flow to its observability
 * posture across eight pillars: logs, metrics, tracing, alerts, dashboards,
 * health_probes, error_budget, and sentry.
 *
 * Runs synchronously against the filesystem. Stores its output at
 * `.pulse/current/PULSE_OBSERVABILITY_COVERAGE.json`.
 */

import { safeJoin, safeResolve } from './safe-path';
import { ensureDir, pathExists, readJsonFile, writeTextFile } from './safe-fs';
import { walkFiles, readFileSafe } from './parsers/utils';
import type {
  CapabilityObservability,
  FlowObservability,
  LogQuality,
  ObservabilityCoverageState,
  ObservabilityPillar,
  ObservabilityStatus,
  PerFileLoggingEntry,
} from './types.observability-coverage';
import type {
  PulseCapability,
  PulseCapabilityState,
  PulseFlowProjection,
  PulseFlowProjectionItem,
} from './types';

const ARTIFACT_FILE_NAME = 'PULSE_OBSERVABILITY_COVERAGE.json';

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

/**
 * Main entry point. Scans every capability and flow for observability
 * coverage across all eight pillars.
 */
export function buildObservabilityCoverage(rootDir: string): ObservabilityCoverageState {
  const backendDir = safeJoin(rootDir, 'backend');
  const frontendDir = safeJoin(rootDir, 'frontend');
  const workerDir = safeJoin(rootDir, 'worker');
  const pulseCurrentDir = safeJoin(rootDir, '.pulse', 'current');

  const allFiles: string[] = [
    ...walkFiles(backendDir, ['.ts', '.tsx']),
    ...walkFiles(frontendDir, ['.ts', '.tsx']),
    ...walkFiles(workerDir, ['.ts', '.tsx']),
  ];

  const capabilities = loadCapabilities(pulseCurrentDir);
  const capabilityItems = buildCapabilityObservability(capabilities, allFiles);

  const flows = loadFlows(pulseCurrentDir);
  const flowItems = buildFlowObservability(flows, capabilityItems);

  const topGaps = buildTopGaps(capabilityItems);

  const state: ObservabilityCoverageState = {
    generatedAt: new Date().toISOString(),
    summary: buildSummary(capabilityItems, flowItems, topGaps),
    capabilities: capabilityItems,
    flows: flowItems,
    topGaps,
  };

  ensureDir(pulseCurrentDir, { recursive: true });
  writeTextFile(safeJoin(pulseCurrentDir, ARTIFACT_FILE_NAME), JSON.stringify(state, null, 2));

  return state;
}

// ─── Logging ──────────────────────────────────────────────────────────────────

/**
 * Scan a set of file paths for structured-logging usage.
 *
 * Returns `'observed'` when structured primitives (`this.logger.`, `Logger.log`,
 * `winston.`, `pino.`) dominate, `'partial'` when only `console.log` is present,
 * and `'missing'` when no log call is found.
 */
export function scanForLogging(filePaths: string[]): ObservabilityStatus {
  let structuredCount = 0;
  let consoleCount = 0;

  for (const filePath of filePaths) {
    const content = readFileSafe(filePath);
    if (
      /this\.logger\.|Logger\.(log|error|warn|debug|verbose)|new Logger\(|winston\.(info|error|warn|debug|log)|pino\(/m.test(
        content,
      )
    ) {
      structuredCount++;
    }
    if (/console\.(log|error|warn|debug|info)\(/m.test(content)) {
      consoleCount++;
    }
  }

  if (structuredCount > 0) return 'observed';
  if (consoleCount > 0) return 'partial';
  return 'missing';
}

/**
 * Scan a set of file contents for structured-log field names.
 *
 * Detects occurrences of known structured-log keys (workspaceId, userId,
 * externalId, operation, status, durationMs, errorCode, requestId, traceId,
 * spanId) inside log-call argument objects.
 */
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

/**
 * Per-file logging posture analysis.
 *
 * Returns one entry per file with structured-logging, console, error-logging,
 * tracing, and sentry flags plus any structured field names found.
 */
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

/**
 * Compute the 4-tier code-level instrumentation quality score.
 *
 * - comprehensive: spans + structured logs + alerts/sentry all present
 * - adequate: logs present (structured) but no spans or alerts
 * - minimal: occasional logs (console only, no structured) or sparse coverage
 * - none: no observability instrumentation found
 */
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

// ─── Metrics ──────────────────────────────────────────────────────────────────

/**
 * Scan a set of file paths for metrics instrumentation.
 *
 * Looks for Prometheus client (`@Metric()`, `counter.`, `histogram.`, `gauge.`),
 * DataDog (`dd-`, `DD-`, `statsd`), and OpenTelemetry metrics patterns.
 */
export function scanForMetrics(filePaths: string[]): ObservabilityStatus {
  let found = 0;

  for (const filePath of filePaths) {
    const content = readFileSafe(filePath);
    if (
      /@Metric\(|counter\.(inc|add|set)|histogram\.(observe|record)|gauge\.(inc|dec|set)|summary\.observe|prom\.client|dd-trace\/metrics|statsd\.|import.*datadog|otel\.metrics|meter\.create(Counter|Histogram|Gauge)/m.test(
        content,
      )
    ) {
      found++;
    }
  }

  return found > 0 ? 'observed' : 'missing';
}

// ─── Tracing ──────────────────────────────────────────────────────────────────

/**
 * Scan a set of file paths for distributed-tracing instrumentation.
 *
 * Detects `@Span()` decorators, `tracer.` / `span.` calls, `dd-trace`,
 * and OpenTelemetry span patterns.
 */
export function scanForTracing(filePaths: string[]): ObservabilityStatus {
  let found = 0;

  for (const filePath of filePaths) {
    const content = readFileSafe(filePath);
    if (
      /@Span\(|tracer\.startSpan|tracer\.trace|span\.setTag|span\.finish|span\.log|dd-trace|otel\.trace|OpentelemetryModule|withSpan\(|context\.with\(|startSpan\(|trace\.getTracer\(|opentelemetry.*trace/m.test(
        content,
      )
    ) {
      found++;
    }
  }

  return found > 0 ? 'observed' : 'missing';
}

// ─── Error Tracking ───────────────────────────────────────────────────────────

/**
 * Scan a set of file paths for error-tracking (Sentry) instrumentation.
 *
 * Detects `Sentry.captureException`, `Sentry.captureMessage`, `@Sentry()`,
 * `initSentry`, and `SentryInterceptor` usage.
 */
export function scanForErrorTracking(filePaths: string[]): ObservabilityStatus {
  let found = 0;

  for (const filePath of filePaths) {
    const content = readFileSafe(filePath);
    if (
      /@Sentry\(|Sentry\.(captureException|captureMessage|init|addBreadcrumb)|initSentry|SentryInterceptor|SentryModule|from ['"]@sentry\//m.test(
        content,
      )
    ) {
      found++;
    }
  }

  return found > 0 ? 'observed' : 'missing';
}

// ─── Integrations Detection ───────────────────────────────────────────────────

/**
 * Identify capabilities that make external API calls but have zero
 * observability instrumentation.
 */
export function detectIntegrationsWithoutObservability(
  capabilities: CapabilityObservability[],
): string[] {
  return capabilities
    .filter((cap) => {
      const hasExternalCall = /http|fetch|axios|got|node-fetch|api/.test(
        cap.capabilityName.toLowerCase(),
      );
      const hasObservability = cap.overallStatus === 'covered' || cap.overallStatus === 'partial';
      return hasExternalCall && !hasObservability;
    })
    .map((cap) => cap.capabilityId);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function loadCapabilities(pulseCurrentDir: string): PulseCapability[] {
  const statePath = safeJoin(pulseCurrentDir, 'PULSE_CAPABILITY_STATE.json');
  if (!pathExists(statePath)) return [];
  try {
    const state = readJsonFile<PulseCapabilityState>(statePath);
    return state.capabilities ?? [];
  } catch {
    return [];
  }
}

function loadFlows(pulseCurrentDir: string): PulseFlowProjectionItem[] {
  const statePath = safeJoin(pulseCurrentDir, 'PULSE_FLOW_PROJECTION.json');
  if (!pathExists(statePath)) return [];
  try {
    const state = readJsonFile<PulseFlowProjection>(statePath);
    return state.flows ?? [];
  } catch {
    return [];
  }
}

function buildCapabilityObservability(
  capabilities: PulseCapability[],
  allFiles: string[],
): CapabilityObservability[] {
  const fileCache = new Map<string, string>();

  function getContent(filePath: string): string {
    if (!fileCache.has(filePath)) {
      fileCache.set(filePath, readFileSafe(filePath));
    }
    return fileCache.get(filePath)!;
  }

  return capabilities.map((cap) => {
    const relevantFiles = cap.filePaths.filter((fp) => allFiles.includes(fp));

    const logs = scanForLogging(relevantFiles);
    const metrics = scanForMetrics(relevantFiles);
    const tracing = scanForTracing(relevantFiles);
    const sentry = scanForErrorTracking(relevantFiles);

    const healthEndpoint = findHealthEndpoint(relevantFiles);
    const alerts = scanForAlerts(relevantFiles);
    const dashboards = findDashboards(relevantFiles);
    const errorBudget = cap.runtimeCritical ? 'missing' : 'not_applicable';

    const pillars: Record<ObservabilityPillar, ObservabilityStatus> = {
      logs,
      metrics,
      tracing,
      alerts,
      dashboards,
      health_probes: healthEndpoint ? 'observed' : 'missing',
      error_budget: errorBudget as ObservabilityStatus,
      sentry,
    };

    const structuredLogFields = scanForStructuredFields(relevantFiles, getContent);
    const perFileLogging = scanPerFileLogging(relevantFiles, getContent);

    const detail = {
      logCount: countLogCalls(relevantFiles, getContent),
      metricNames: findMetricNames(relevantFiles, getContent),
      traceSpans: countTraceSpans(relevantFiles, getContent),
      alertRules: countAlertRules(relevantFiles, getContent),
      dashboardUrls: findDashboardUrls(relevantFiles, getContent),
      healthProbeUrl: healthEndpoint ?? null,
      errorBudgetRemaining: null,
      sentryProjectId: null,
      structuredLogFields,
      perFileLogging,
    };

    const overallStatus = computeOverallStatus(pillars);

    const logQuality = computeLogQuality(logs, tracing, sentry, structuredLogFields.length);

    return {
      capabilityId: cap.id,
      capabilityName: cap.name,
      pillars,
      details: detail,
      overallStatus,
      logQuality,
    };
  });
}

function buildFlowObservability(
  flows: PulseFlowProjectionItem[],
  capabilityItems: CapabilityObservability[],
): FlowObservability[] {
  const capById = new Map(capabilityItems.map((c) => [c.capabilityId, c]));

  return flows.map((flow) => {
    const flowCapabilityIds: string[] = (flow.capabilityIds as string[]) ?? [];
    const flowCaps = flowCapabilityIds
      .map((cid) => capById.get(cid))
      .filter(Boolean) as CapabilityObservability[];

    const pillarCounts: Record<ObservabilityPillar, { observed: number; total: number }> = {
      logs: { observed: 0, total: flowCaps.length },
      metrics: { observed: 0, total: flowCaps.length },
      tracing: { observed: 0, total: flowCaps.length },
      alerts: { observed: 0, total: flowCaps.length },
      dashboards: { observed: 0, total: flowCaps.length },
      health_probes: { observed: 0, total: flowCaps.length },
      error_budget: { observed: 0, total: flowCaps.length },
      sentry: { observed: 0, total: flowCaps.length },
    };

    for (const cap of flowCaps) {
      for (const pillar of Object.keys(pillarCounts) as ObservabilityPillar[]) {
        if (cap.pillars[pillar] === 'observed') {
          pillarCounts[pillar].observed++;
        }
      }
    }

    const pillars = Object.fromEntries(
      (Object.keys(pillarCounts) as ObservabilityPillar[]).map((pillar) => {
        const count = pillarCounts[pillar];
        if (count.total === 0) return [pillar, 'not_applicable' as ObservabilityStatus];
        const ratio = count.observed / count.total;
        if (ratio >= 0.8) return [pillar, 'observed' as ObservabilityStatus];
        if (ratio > 0) return [pillar, 'partial' as ObservabilityStatus];
        return [pillar, 'missing' as ObservabilityStatus];
      }),
    ) as Record<ObservabilityPillar, ObservabilityStatus>;

    const overallStatus = computeOverallStatus(pillars);

    return {
      flowId: flow.id,
      flowName: flow.name,
      pillars,
      capabilities: flowCaps,
      overallStatus,
    };
  });
}

function computeOverallStatus(
  pillars: Record<ObservabilityPillar, ObservabilityStatus>,
): 'covered' | 'partial' | 'uncovered' {
  const statuses = Object.values(pillars) as ObservabilityStatus[];
  const observed = statuses.filter((s) => s === 'observed').length;
  const totalRelevant = statuses.filter((s) => s !== 'not_applicable').length;

  if (totalRelevant === 0) return 'uncovered';
  const ratio = observed / totalRelevant;
  if (ratio >= 0.8) return 'covered';
  if (ratio > 0) return 'partial';
  return 'uncovered';
}

function findHealthEndpoint(filePaths: string[]): string | null {
  for (const filePath of filePaths) {
    const content = readFileSafe(filePath);
    const m = content.match(
      /@(Get|Head)\s*\(\s*['"](?:\/)?(healthz?|health\/detailed|ready)\s*['"]/i,
    );
    if (m) return `/${m[2]}`;
  }
  return null;
}

function scanForAlerts(filePaths: string[]): ObservabilityStatus {
  let found = 0;
  for (const filePath of filePaths) {
    const content = readFileSafe(filePath);
    if (
      /datadog.*monitor|@monitor|PROMETHEUS_ALERT|alertmanager|uptime_kuma|better_uptime|webhook.*alert|alertApi|notifyAlert/m.test(
        content,
      )
    ) {
      found++;
    }
  }
  return found > 0 ? 'observed' : 'missing';
}

function findDashboards(filePaths: string[]): ObservabilityStatus {
  for (const filePath of filePaths) {
    const content = readFileSafe(filePath);
    if (
      /grafana|kibana|splunk|datadog.*dashboard|dashboard.*url|bullboard|BullBoard|@BullBoard\(/m.test(
        content,
      )
    ) {
      return 'observed';
    }
  }
  return 'missing';
}

function countLogCalls(filePaths: string[], getContent: (p: string) => string): number {
  let count = 0;
  for (const fp of filePaths) {
    const content = getContent(fp);
    const matches = content.match(
      /(this\.logger\.|Logger\.(log|error|warn|debug|verbose)|new Logger\(|console\.(log|error|warn|debug|info)\()/gm,
    );
    if (matches) count += matches.length;
  }
  return count;
}

function findMetricNames(filePaths: string[], getContent: (p: string) => string): string[] {
  const names = new Set<string>();
  for (const fp of filePaths) {
    const content = getContent(fp);
    const matches = content.matchAll(/(?:counter|histogram|gauge|meter)\(\s*['"]([^'"]+)['"]/g);
    for (const m of matches) names.add(m[1]);
  }
  return [...names];
}

function countTraceSpans(filePaths: string[], getContent: (p: string) => string): number {
  let count = 0;
  for (const fp of filePaths) {
    const content = getContent(fp);
    const matches = content.match(
      /@Span\(|tracer\.startSpan|span\.setTag|startSpan\(|trace\.getTracer\(/gm,
    );
    if (matches) count += matches.length;
  }
  return count;
}

function countAlertRules(filePaths: string[], getContent: (p: string) => string): number {
  let count = 0;
  for (const fp of filePaths) {
    const content = getContent(fp);
    const matches = content.match(
      /datadog.*monitor|@monitor|PROMETHEUS_ALERT|alertmanager|alertApi|notifyAlert/gm,
    );
    if (matches) count += matches.length;
  }
  return count;
}

function findDashboardUrls(filePaths: string[], getContent: (p: string) => string): string[] {
  const urls = new Set<string>();
  for (const fp of filePaths) {
    const content = getContent(fp);
    const matches = content.matchAll(/(?:dashboard|grafana|datadog).*(?:https?:\/\/[^\s'"]+)/gi);
    for (const m of matches) urls.add(m[0]);
  }
  return [...urls];
}

function buildTopGaps(
  capabilityItems: CapabilityObservability[],
): ObservabilityCoverageState['topGaps'] {
  return capabilityItems
    .filter((cap) => cap.overallStatus !== 'covered')
    .map((cap) => {
      const missingPillars = (
        Object.entries(cap.pillars) as Array<[ObservabilityPillar, ObservabilityStatus]>
      )
        .filter(([, status]) => status === 'missing')
        .map(([pillar]) => pillar);

      const criticalMissing = missingPillars.filter((p) =>
        ['logs', 'metrics', 'alerts', 'sentry'].includes(p),
      );
      const highMissing = missingPillars.filter((p) => ['tracing', 'health_probes'].includes(p));

      let severity: 'critical' | 'high' | 'medium';
      if (criticalMissing.length > 0) {
        severity = 'critical';
      } else if (highMissing.length > 0) {
        severity = 'high';
      } else {
        severity = 'medium';
      }

      return { capabilityId: cap.capabilityId, missingPillars, severity };
    })
    .filter((gap) => gap.missingPillars.length > 0)
    .sort((a, b) => {
      const order = { critical: 0, high: 1, medium: 2 };
      return order[a.severity] - order[b.severity];
    })
    .slice(0, 20);
}

function buildSummary(
  capabilityItems: CapabilityObservability[],
  flowItems: FlowObservability[],
  _topGaps: ObservabilityCoverageState['topGaps'],
): ObservabilityCoverageState['summary'] {
  const allPerFileEntries = capabilityItems.flatMap((c) => c.details.perFileLogging);
  const uniqueFiles = new Set(allPerFileEntries.map((e) => e.filePath));
  const dedupedEntries = Array.from(uniqueFiles).map(
    (fp) => allPerFileEntries.find((e) => e.filePath === fp)!,
  );

  return {
    totalCapabilities: capabilityItems.length,
    fullyCoveredCapabilities: capabilityItems.filter((c) => c.overallStatus === 'covered').length,
    partiallyCoveredCapabilities: capabilityItems.filter((c) => c.overallStatus === 'partial')
      .length,
    uncoveredCapabilities: capabilityItems.filter((c) => c.overallStatus === 'uncovered').length,
    totalFlows: flowItems.length,
    fullyCoveredFlows: flowItems.filter((f) => f.overallStatus === 'covered').length,
    criticalCapabilitiesWithoutAlerts: capabilityItems.filter(
      (c) => c.pillars.alerts === 'missing' && c.overallStatus !== 'covered',
    ).length,
    criticalFlowsWithoutTracing: flowItems.filter(
      (f) => f.pillars.tracing === 'missing' && f.overallStatus !== 'covered',
    ).length,
    integrationsWithoutObservability:
      detectIntegrationsWithoutObservability(capabilityItems).length,
    capabilitiesWithComprehensiveLogging: capabilityItems.filter(
      (c) => c.logQuality === 'comprehensive',
    ).length,
    capabilitiesWithAdequateLogging: capabilityItems.filter((c) => c.logQuality === 'adequate')
      .length,
    capabilitiesWithMinimalLogging: capabilityItems.filter((c) => c.logQuality === 'minimal')
      .length,
    capabilitiesWithNoLogging: capabilityItems.filter((c) => c.logQuality === 'none').length,
    filesWithStructuredLogging: dedupedEntries.filter((e) => e.hasStructured).length,
    filesWithConsoleOnly: dedupedEntries.filter((e) => e.hasConsole && !e.hasStructured).length,
    filesWithNoLogging: dedupedEntries.filter((e) => e.noLogging).length,
    filesWithErrorLogging: dedupedEntries.filter((e) => e.hasErrorLogging).length,
  };
}
