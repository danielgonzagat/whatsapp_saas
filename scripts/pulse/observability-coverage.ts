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

import * as path from 'node:path';
import { safeJoin, safeResolve } from './safe-path';
import { ensureDir, pathExists, readJsonFile, readTextFile, writeTextFile } from './safe-fs';
import { walkFiles, readFileSafe } from './parsers/utils';
import type {
  CapabilityObservability,
  FlowObservability,
  ObservabilityEvidenceKind,
  LogQuality,
  ObservabilityCoverageState,
  ObservabilityPillarEvidence,
  ObservabilityPillar,
  ObservabilityStatus,
  PerFileLoggingEntry,
  ObservabilityMachineImprovementSignal,
} from './types.observability-coverage';
import type {
  PulseCapability,
  PulseCapabilityState,
  PulseFlowProjection,
  PulseFlowProjectionItem,
  PulseObservabilityEvidence,
  PulseRuntimeEvidence,
} from './types';
import type { BehaviorGraph, BehaviorNode } from './types.behavior-graph';
import type { RuntimeFusionState, RuntimeSignal } from './types.runtime-fusion';

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

interface PillarScanResult {
  status: ObservabilityStatus;
  sourceKind: ObservabilityEvidenceKind;
  source: string;
  reason: string;
  filePaths: string[];
}

interface ObservabilityRuntimeContext {
  pillars: ObservabilityPillar[];
  observabilityEvidence: PulseObservabilityEvidence | null;
  runtimeEvidence: PulseRuntimeEvidence | null;
  runtimeFusion: RuntimeFusionState | null;
  behaviorGraph: BehaviorGraph | null;
  behaviorNodesByFile: Map<string, BehaviorNode[]>;
  runtimeSignalsByCapability: Map<string, RuntimeSignal[]>;
  runtimeSignalsByFlow: Map<string, RuntimeSignal[]>;
}

const TRUSTED_OBSERVED_KINDS = new Set<ObservabilityEvidenceKind>([
  'runtime_observed',
  'static_instrumentation',
]);

const UNTRUSTED_PRESENT_KINDS = new Set<ObservabilityEvidenceKind>([
  'configuration',
  'catalog',
  'simulated',
]);

function containsSimulatedObservabilitySource(content: string): boolean {
  return /\b(PULSE_SIMULATED_OBSERVABILITY|SIMULATED_OBSERVABILITY|mockObservability|fakeObservability|simulatedObservability|observabilityMock)\b/i.test(
    content,
  );
}

function missingEvidence(reason: string): PillarScanResult {
  return {
    status: 'missing',
    sourceKind: 'absent',
    source: 'none',
    reason,
    filePaths: [],
  };
}

function normalizeStatusForEvidence(
  status: ObservabilityStatus,
  sourceKind: ObservabilityEvidenceKind,
): ObservabilityStatus {
  if (sourceKind === 'not_applicable') return 'not_applicable';
  if (sourceKind === 'absent' || sourceKind === 'simulated') return 'missing';
  if (sourceKind === 'configuration' || sourceKind === 'catalog') return 'partial';
  return status;
}

function toRepoRelativePath(rootDir: string, filePath: string): string {
  const relativePath = path.relative(safeResolve(rootDir), safeResolve(filePath));
  if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    return filePath;
  }
  return relativePath.split(path.sep).join('/');
}

function resolveCapabilityFiles(
  rootDir: string,
  filePaths: string[],
  allFiles: Set<string>,
): string[] {
  const resolved: string[] = [];
  for (const filePath of filePaths) {
    const absolutePath = path.isAbsolute(filePath)
      ? safeResolve(filePath)
      : safeResolve(rootDir, filePath);
    if (allFiles.has(absolutePath)) {
      resolved.push(absolutePath);
    }
  }
  return [...new Set(resolved)].sort();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readPulseArtifact<T>(pulseCurrentDir: string, fileName: string): T | null {
  const artifactPath = safeJoin(pulseCurrentDir, fileName);
  if (!pathExists(artifactPath)) return null;
  try {
    return readJsonFile<T>(artifactPath);
  } catch {
    return null;
  }
}

function deriveObservabilityPillars(rootDir: string): ObservabilityPillar[] {
  const localTypePath = safeJoin(__dirname, 'types.observability-coverage.ts');
  const repoTypePath = safeJoin(rootDir, 'scripts', 'pulse', 'types.observability-coverage.ts');
  const typePath = pathExists(localTypePath) ? localTypePath : repoTypePath;
  if (!pathExists(typePath)) return [];

  const content = readTextFile(typePath);
  const union = content.match(/export type ObservabilityPillar\s*=([\s\S]*?);/m)?.[1] ?? '';
  const pillars = [...union.matchAll(/'([^']+)'/g)].map((match) => match[1] as ObservabilityPillar);
  return [...new Set(pillars)];
}

function tokenizeObservabilityTerm(value: string): Set<string> {
  return new Set(
    value
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/[_./:-]+/g, ' ')
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean),
  );
}

function tokenOverlap(left: Set<string>, right: Set<string>): number {
  let overlap = 0;
  for (const token of left) {
    if (right.has(token)) overlap++;
  }
  return overlap;
}

function signalMatchesPillar(signalName: string, pillar: ObservabilityPillar): boolean {
  const signalTokens = tokenizeObservabilityTerm(signalName);
  const pillarTokens = tokenizeObservabilityTerm(pillar);
  return tokenOverlap(signalTokens, pillarTokens) > 0;
}

function observabilitySignalForPillar(
  evidence: PulseObservabilityEvidence | null,
  pillar: ObservabilityPillar,
): string | null {
  if (!evidence?.executed || !isRecord(evidence.signals)) return null;
  for (const [name, value] of Object.entries(evidence.signals)) {
    if (value === true && signalMatchesPillar(name, pillar)) {
      return name;
    }
  }
  return null;
}

function loadObservabilityRuntimeContext(
  rootDir: string,
  pulseCurrentDir: string,
): ObservabilityRuntimeContext {
  const runtimeFusion = readPulseArtifact<RuntimeFusionState>(
    pulseCurrentDir,
    'PULSE_RUNTIME_FUSION.json',
  );
  const behaviorGraph = readPulseArtifact<BehaviorGraph>(
    pulseCurrentDir,
    'PULSE_BEHAVIOR_GRAPH.json',
  );
  const behaviorNodesByFile = new Map<string, BehaviorNode[]>();
  for (const node of behaviorGraph?.nodes ?? []) {
    const absolutePath = safeResolve(rootDir, node.filePath);
    for (const key of [absolutePath, node.filePath]) {
      const existing = behaviorNodesByFile.get(key) ?? [];
      existing.push(node);
      behaviorNodesByFile.set(key, existing);
    }
  }

  const runtimeSignalsByCapability = new Map<string, RuntimeSignal[]>();
  const runtimeSignalsByFlow = new Map<string, RuntimeSignal[]>();
  for (const signal of runtimeFusion?.signals ?? []) {
    for (const capabilityId of signal.affectedCapabilityIds ?? []) {
      const existing = runtimeSignalsByCapability.get(capabilityId) ?? [];
      existing.push(signal);
      runtimeSignalsByCapability.set(capabilityId, existing);
    }
    for (const flowId of signal.affectedFlowIds ?? []) {
      const existing = runtimeSignalsByFlow.get(flowId) ?? [];
      existing.push(signal);
      runtimeSignalsByFlow.set(flowId, existing);
    }
  }

  return {
    pillars: deriveObservabilityPillars(rootDir),
    observabilityEvidence: readPulseArtifact<PulseObservabilityEvidence>(
      pulseCurrentDir,
      'PULSE_OBSERVABILITY_EVIDENCE.json',
    ),
    runtimeEvidence: readPulseArtifact<PulseRuntimeEvidence>(
      pulseCurrentDir,
      'PULSE_RUNTIME_EVIDENCE.json',
    ),
    runtimeFusion,
    behaviorGraph,
    behaviorNodesByFile,
    runtimeSignalsByCapability,
    runtimeSignalsByFlow,
  };
}

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
  const runtimeContext = loadObservabilityRuntimeContext(rootDir, pulseCurrentDir);
  const capabilityItems = buildCapabilityObservability(
    rootDir,
    capabilities,
    allFiles,
    runtimeContext,
  );

  const flows = loadFlows(pulseCurrentDir);
  const flowItems = buildFlowObservability(flows, capabilityItems);

  const topGaps = buildTopGaps(capabilityItems);

  const state: ObservabilityCoverageState = {
    generatedAt: new Date().toISOString(),
    summary: buildSummary(capabilityItems, flowItems, topGaps, runtimeContext),
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
  return scanForLoggingEvidence(filePaths).status;
}

function scanForLoggingEvidence(filePaths: string[]): PillarScanResult {
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
  return scanForMetricsEvidence(filePaths).status;
}

function scanForMetricsEvidence(filePaths: string[]): PillarScanResult {
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

// ─── Tracing ──────────────────────────────────────────────────────────────────

/**
 * Scan a set of file paths for distributed-tracing instrumentation.
 *
 * Detects `@Span()` decorators, `tracer.` / `span.` calls, `dd-trace`,
 * and OpenTelemetry span patterns.
 */
export function scanForTracing(filePaths: string[]): ObservabilityStatus {
  return scanForTracingEvidence(filePaths).status;
}

function scanForTracingEvidence(filePaths: string[]): PillarScanResult {
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

// ─── Error Tracking ───────────────────────────────────────────────────────────

/**
 * Scan a set of file paths for error-tracking (Sentry) instrumentation.
 *
 * Detects `Sentry.captureException`, `Sentry.captureMessage`, `@Sentry()`,
 * `initSentry`, and `SentryInterceptor` usage.
 */
export function scanForErrorTracking(filePaths: string[]): ObservabilityStatus {
  return scanForErrorTrackingEvidence(filePaths).status;
}

function scanForErrorTrackingEvidence(filePaths: string[]): PillarScanResult {
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

// ─── Integrations Detection ───────────────────────────────────────────────────

/**
 * Identify capabilities that make external API calls but have zero
 * observability instrumentation.
 */
export function detectIntegrationsWithoutObservability(
  capabilities: CapabilityObservability[],
): string[] {
  return capabilities
    .filter(
      (cap) =>
        cap.details.matchedFilePaths.length === 0 &&
        cap.overallStatus !== 'covered' &&
        cap.untrustedEvidencePillars.length > 0,
    )
    .map((cap) => cap.capabilityId);
}

function detectRuntimeIntegrationsWithoutObservability(
  capabilities: CapabilityObservability[],
  runtimeContext: ObservabilityRuntimeContext,
): string[] {
  return capabilities
    .filter((cap) => {
      const hasExternalCall = cap.details.matchedFilePaths.some((filePath) => {
        const absolutePath = safeResolve(filePath);
        const nodes = runtimeContext.behaviorNodesByFile.get(absolutePath) ?? [];
        return nodes.some((node) => node.externalCalls.length > 0);
      });
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
  rootDir: string,
  capabilities: PulseCapability[],
  allFiles: string[],
  runtimeContext: ObservabilityRuntimeContext,
): CapabilityObservability[] {
  const fileCache = new Map<string, string>();
  const allFileSet = new Set(allFiles.map((filePath) => safeResolve(filePath)));

  function getContent(filePath: string): string {
    if (!fileCache.has(filePath)) {
      fileCache.set(filePath, readFileSafe(filePath));
    }
    return fileCache.get(filePath)!;
  }

  return capabilities.map((cap) => {
    const relevantFiles = resolveCapabilityFiles(rootDir, cap.filePaths, allFileSet);
    const evidence = Object.fromEntries(
      runtimeContext.pillars.map((pillar) => [
        pillar,
        normalizePillarEvidence(
          cap.id,
          pillar,
          scanPillarEvidence(cap, pillar, relevantFiles, runtimeContext),
          rootDir,
        ),
      ]),
    ) as Record<ObservabilityPillar, ObservabilityPillarEvidence>;

    const pillars = Object.fromEntries(
      (Object.entries(evidence) as Array<[ObservabilityPillar, ObservabilityPillarEvidence]>).map(
        ([pillar, item]) => [pillar, item.status],
      ),
    ) as Record<ObservabilityPillar, ObservabilityStatus>;

    const structuredLogFields = scanForStructuredFields(relevantFiles, getContent);
    const perFileLogging = scanPerFileLogging(relevantFiles, getContent).map((entry) => ({
      ...entry,
      filePath: toRepoRelativePath(rootDir, entry.filePath),
    }));

    const detail = {
      matchedFilePaths: relevantFiles.map((filePath) => toRepoRelativePath(rootDir, filePath)),
      logCount: countLogCalls(relevantFiles, getContent),
      metricNames: findMetricNames(relevantFiles, getContent),
      traceSpans: countTraceSpans(relevantFiles, getContent),
      alertRules: countAlertRules(relevantFiles, getContent),
      dashboardUrls: findDashboardUrls(relevantFiles, getContent),
      healthProbeUrl:
        evidence.health_probes.status === 'observed'
          ? evidence.health_probes.source.replace(/^health endpoint /, '')
          : null,
      errorBudgetRemaining: null,
      sentryProjectId: null,
      structuredLogFields,
      perFileLogging,
    };

    const overallStatus = computeOverallStatus(pillars);

    const logQuality = computeLogQuality(
      pillars.logs,
      pillars.tracing,
      pillars.sentry,
      structuredLogFields.length,
    );

    const trustedObservedPillars = (
      Object.entries(evidence) as Array<[ObservabilityPillar, ObservabilityPillarEvidence]>
    )
      .filter(([, item]) => item.observed)
      .map(([pillar]) => pillar);

    const untrustedEvidencePillars = (
      Object.entries(evidence) as Array<[ObservabilityPillar, ObservabilityPillarEvidence]>
    )
      .filter(([, item]) => UNTRUSTED_PRESENT_KINDS.has(item.sourceKind))
      .map(([pillar]) => pillar);
    const machineImprovementSignals = (
      Object.values(evidence) as ObservabilityPillarEvidence[]
    ).flatMap((item) => (item.machineImprovementSignal ? [item.machineImprovementSignal] : []));

    return {
      capabilityId: cap.id,
      capabilityName: cap.name,
      runtimeCritical: cap.runtimeCritical,
      pillars,
      evidence,
      details: detail,
      overallStatus,
      logQuality,
      trustedObservedPillars,
      untrustedEvidencePillars,
      criticalObservedByUntrustedSource: false,
      machineImprovementSignals,
    };
  });
}

function scanPillarEvidence(
  capability: PulseCapability,
  pillar: ObservabilityPillar,
  relevantFiles: string[],
  runtimeContext: ObservabilityRuntimeContext,
): PillarScanResult {
  if (pillar === 'error_budget' && !capability.runtimeCritical) {
    return {
      status: 'not_applicable',
      sourceKind: 'not_applicable',
      source: 'non-runtime-critical capability',
      reason: 'Error budget evidence is not required for non-runtime-critical capabilities.',
      filePaths: [],
    };
  }

  const runtimeSignalEvidence = findRuntimeSignalEvidence(capability.id, pillar, runtimeContext);
  if (runtimeSignalEvidence) return runtimeSignalEvidence;

  const behaviorGraphEvidence = findBehaviorGraphEvidence(pillar, relevantFiles, runtimeContext);
  if (behaviorGraphEvidence) return behaviorGraphEvidence;

  const artifactSignal = observabilitySignalForPillar(runtimeContext.observabilityEvidence, pillar);
  if (artifactSignal) {
    return {
      status: 'partial',
      sourceKind: 'configuration',
      source: `observability artifact signal ${artifactSignal}`,
      reason:
        'The shared observability artifact contains this signal, but it is not scoped to the capability.',
      filePaths: [],
    };
  }

  const runtimeProbeEvidence = findRuntimeProbeEvidence(pillar, runtimeContext);
  if (runtimeProbeEvidence) return runtimeProbeEvidence;

  return scanStaticPillarEvidence(pillar, relevantFiles);
}

function findRuntimeSignalEvidence(
  capabilityId: string,
  pillar: ObservabilityPillar,
  runtimeContext: ObservabilityRuntimeContext,
): PillarScanResult | null {
  const matchingSignals = (
    runtimeContext.runtimeSignalsByCapability.get(capabilityId) ?? []
  ).filter(
    (signal) =>
      signal.evidenceMode !== 'simulated' &&
      (signalMatchesPillar(signal.source, pillar) ||
        signalMatchesPillar(signal.type, pillar) ||
        signalMatchesPillar(signal.evidenceKind, pillar) ||
        signalMatchesPillar(signal.message, pillar)),
  );
  const observedSignals = matchingSignals.filter((signal) => signal.evidenceMode === 'observed');
  const signal = observedSignals[0] ?? matchingSignals[0];
  if (!signal) return null;

  return {
    status: signal.evidenceMode === 'observed' ? 'observed' : 'partial',
    sourceKind: signal.evidenceMode === 'observed' ? 'runtime_observed' : 'configuration',
    source: `runtime fusion signal ${signal.id}`,
    reason: signal.message,
    filePaths: signal.affectedFilePaths,
  };
}

function findBehaviorGraphEvidence(
  pillar: ObservabilityPillar,
  relevantFiles: string[],
  runtimeContext: ObservabilityRuntimeContext,
): PillarScanResult | null {
  const graphFlag = `has${pillar
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')}`;
  const observedFiles: string[] = [];

  for (const filePath of relevantFiles) {
    const nodes = runtimeContext.behaviorNodesByFile.get(filePath) ?? [];
    if (
      nodes.some((node) => {
        const nodeRecord: Record<string, unknown> = node;
        return nodeRecord[graphFlag] === true;
      })
    ) {
      observedFiles.push(filePath);
    }
  }

  if (observedFiles.length === 0) return null;
  return {
    status: 'observed',
    sourceKind: 'static_instrumentation',
    source: `behavior graph ${graphFlag}`,
    reason: 'The behavior graph reports capability-owned nodes with this observability signal.',
    filePaths: observedFiles,
  };
}

function findRuntimeProbeEvidence(
  pillar: ObservabilityPillar,
  runtimeContext: ObservabilityRuntimeContext,
): PillarScanResult | null {
  const probes = runtimeContext.runtimeEvidence?.probes ?? [];
  const matchingProbe = probes.find(
    (probe) =>
      probe.executed &&
      probe.status === 'passed' &&
      (signalMatchesPillar(probe.probeId, pillar) ||
        signalMatchesPillar(probe.target, pillar) ||
        signalMatchesPillar(probe.summary, pillar)),
  );
  if (!matchingProbe) return null;
  return {
    status: 'partial',
    sourceKind: 'configuration',
    source: `runtime probe ${matchingProbe.probeId}`,
    reason:
      'A runtime probe produced matching evidence, but the probe artifact is not scoped to this capability.',
    filePaths: [],
  };
}

function scanStaticPillarEvidence(
  pillar: ObservabilityPillar,
  relevantFiles: string[],
): PillarScanResult {
  if (pillar === 'logs') return scanForLoggingEvidence(relevantFiles);
  if (pillar === 'metrics') return scanForMetricsEvidence(relevantFiles);
  if (pillar === 'tracing') return scanForTracingEvidence(relevantFiles);
  if (pillar === 'alerts') return scanForAlertsEvidence(relevantFiles);
  if (pillar === 'dashboards') return findDashboardEvidence(relevantFiles);
  if (pillar === 'health_probes') return findHealthEndpointEvidence(relevantFiles);
  if (pillar === 'error_budget') return findErrorBudgetEvidence(relevantFiles);
  if (pillar === 'sentry') return scanForErrorTrackingEvidence(relevantFiles);
  return missingEvidence(`No scanner is registered for observability pillar ${pillar}.`);
}

function normalizePillarEvidence(
  capabilityId: string,
  pillar: ObservabilityPillar,
  result: PillarScanResult,
  rootDir: string,
): ObservabilityPillarEvidence {
  const status = normalizeStatusForEvidence(result.status, result.sourceKind);
  const truthMode =
    status === 'observed' && TRUSTED_OBSERVED_KINDS.has(result.sourceKind)
      ? 'observed'
      : result.sourceKind === 'absent'
        ? 'not_available'
        : 'inferred';
  const normalized: ObservabilityPillarEvidence = {
    pillar,
    status,
    sourceKind: result.sourceKind,
    observed: status === 'observed' && TRUSTED_OBSERVED_KINDS.has(result.sourceKind),
    source: result.source,
    reason: result.reason,
    filePaths: result.filePaths.map((filePath) => toRepoRelativePath(rootDir, filePath)),
    truthMode,
    machineImprovementSignal: null,
  };
  normalized.machineImprovementSignal = buildObservabilityMachineSignal(capabilityId, normalized);
  return normalized;
}

function targetEngineForPillar(
  pillar: ObservabilityPillar,
): ObservabilityMachineImprovementSignal['targetEngine'] {
  const tokens = tokenizeObservabilityTerm(pillar);
  if (tokens.has('tracing') || tokens.has('trace')) return 'otel-runtime';
  if (tokens.has('health') || tokens.has('probes') || tokens.has('probe')) return 'runtime-probes';
  if (tokens.has('sentry') || tokens.has('alerts') || tokens.has('alert')) {
    return 'external-sources-orchestrator';
  }
  return 'observability-coverage';
}

function buildObservabilityMachineSignal(
  capabilityId: string,
  evidence: ObservabilityPillarEvidence,
): ObservabilityMachineImprovementSignal | null {
  if (evidence.status === 'observed' || evidence.status === 'not_applicable') return null;

  return {
    id: `observability:${capabilityId}:${evidence.pillar}`,
    targetEngine: targetEngineForPillar(evidence.pillar),
    capabilityId,
    pillar: evidence.pillar,
    truthMode: evidence.truthMode,
    sourceKind: evidence.sourceKind,
    status: evidence.status,
    reason: evidence.reason,
    recommendedPulseAction:
      'Improve PULSE discovery or runtime evidence capture for this observability pillar; do not turn the gap into a product-code edit suggestion.',
    productEditRequired: false,
  };
}

function buildFlowObservability(
  flows: PulseFlowProjectionItem[],
  capabilityItems: CapabilityObservability[],
  runtimeContext: ObservabilityRuntimeContext,
): FlowObservability[] {
  const capById = new Map(capabilityItems.map((c) => [c.capabilityId, c]));

  return flows.map((flow) => {
    const flowCapabilityIds: string[] = (flow.capabilityIds as string[]) ?? [];
    const flowCaps = flowCapabilityIds
      .map((cid) => capById.get(cid))
      .filter(Boolean) as CapabilityObservability[];

    const pillarCounts = Object.fromEntries(
      runtimeContext.pillars.map((pillar) => [pillar, { observed: 0, total: flowCaps.length }]),
    ) as Record<ObservabilityPillar, { observed: number; total: number }>;

    for (const cap of flowCaps) {
      for (const pillar of runtimeContext.pillars) {
        if (cap.pillars[pillar] === 'observed') {
          pillarCounts[pillar].observed++;
        }
      }
    }

    for (const signal of runtimeContext.runtimeSignalsByFlow.get(flow.id) ?? []) {
      if (signal.evidenceMode === 'simulated') continue;
      for (const pillar of runtimeContext.pillars) {
        if (
          signalMatchesPillar(signal.source, pillar) ||
          signalMatchesPillar(signal.type, pillar) ||
          signalMatchesPillar(signal.message, pillar)
        ) {
          pillarCounts[pillar].observed = Math.max(pillarCounts[pillar].observed, 1);
          pillarCounts[pillar].total = Math.max(pillarCounts[pillar].total, 1);
        }
      }
    }

    const pillars = Object.fromEntries(
      runtimeContext.pillars.map((pillar) => {
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

function findHealthEndpointEvidence(filePaths: string[]): PillarScanResult {
  const simulatedFiles: string[] = [];
  for (const filePath of filePaths) {
    const content = readFileSafe(filePath);
    if (containsSimulatedObservabilitySource(content)) {
      simulatedFiles.push(filePath);
      continue;
    }
    const m = content.match(
      /@(Get|Head)\s*\(\s*['"](?:\/)?(healthz?|health\/detailed|ready)\s*['"]/i,
    );
    if (m) {
      return {
        status: 'observed',
        sourceKind: 'static_instrumentation',
        source: `health endpoint /${m[2]}`,
        reason: 'A concrete health endpoint is declared in capability-owned code.',
        filePaths: [filePath],
      };
    }
  }
  if (simulatedFiles.length > 0) {
    return {
      status: 'missing',
      sourceKind: 'simulated',
      source: 'simulated observability marker',
      reason: 'Only simulated health-probe evidence was found.',
      filePaths: simulatedFiles,
    };
  }
  return missingEvidence('No health probe endpoint was found.');
}

function findErrorBudgetEvidence(filePaths: string[]): PillarScanResult {
  const observedFiles: string[] = [];
  const simulatedFiles: string[] = [];
  for (const filePath of filePaths) {
    const content = readFileSafe(filePath);
    if (containsSimulatedObservabilitySource(content)) {
      simulatedFiles.push(filePath);
      continue;
    }
    if (
      /\b(errorBudgetRemaining|errorBudget|error_budget|ERROR_BUDGET|sloTarget|sloThreshold|SLO_TARGET|SLO_THRESHOLD|serviceLevelObjective)\b/m.test(
        content,
      )
    ) {
      observedFiles.push(filePath);
    }
  }
  if (observedFiles.length > 0) {
    return {
      status: 'observed',
      sourceKind: 'static_instrumentation',
      source: 'error budget instrumentation',
      reason: 'Runtime-critical capability-owned code exposes explicit SLO/error-budget evidence.',
      filePaths: observedFiles,
    };
  }
  if (simulatedFiles.length > 0) {
    return {
      status: 'missing',
      sourceKind: 'simulated',
      source: 'simulated observability marker',
      reason: 'Only simulated error-budget evidence was found.',
      filePaths: simulatedFiles,
    };
  }
  return missingEvidence('Runtime-critical capabilities need explicit error-budget evidence.');
}

function scanForAlerts(filePaths: string[]): ObservabilityStatus {
  return scanForAlertsEvidence(filePaths).status;
}

function scanForAlertsEvidence(filePaths: string[]): PillarScanResult {
  const observedFiles: string[] = [];
  const configurationFiles: string[] = [];
  const simulatedFiles: string[] = [];
  for (const filePath of filePaths) {
    const content = readFileSafe(filePath);
    if (containsSimulatedObservabilitySource(content)) {
      simulatedFiles.push(filePath);
      continue;
    }
    if (
      /Sentry\.(captureException|captureMessage)|alertApi\.(send|post|create)|notifyAlert\(|sendAlert\(|webhook.*alert.*(send|post)/m.test(
        content,
      )
    ) {
      observedFiles.push(filePath);
    } else if (
      /datadog.*monitor|@monitor|PROMETHEUS_ALERT|alertmanager|uptime_kuma|better_uptime|OPS_WEBHOOK_URL|AUTOPILOT_ALERT_WEBHOOK_URL|DLQ_WEBHOOK_URL|webhook.*alert/m.test(
        content,
      )
    ) {
      configurationFiles.push(filePath);
    }
  }
  if (observedFiles.length > 0) {
    return {
      status: 'observed',
      sourceKind: 'static_instrumentation',
      source: 'alert dispatch instrumentation',
      reason: 'Alert dispatch code is present in capability-owned code.',
      filePaths: observedFiles,
    };
  }
  if (configurationFiles.length > 0) {
    return {
      status: 'partial',
      sourceKind: 'configuration',
      source: 'alerting configuration',
      reason: 'Alerting configuration exists, but no alert dispatch evidence was found.',
      filePaths: configurationFiles,
    };
  }
  if (simulatedFiles.length > 0) {
    return {
      status: 'missing',
      sourceKind: 'simulated',
      source: 'simulated observability marker',
      reason: 'Only simulated alerting evidence was found.',
      filePaths: simulatedFiles,
    };
  }
  return missingEvidence('No alerting evidence was found.');
}

function findDashboardEvidence(filePaths: string[]): PillarScanResult {
  const catalogFiles: string[] = [];
  const simulatedFiles: string[] = [];
  for (const filePath of filePaths) {
    const content = readFileSafe(filePath);
    if (containsSimulatedObservabilitySource(content)) {
      simulatedFiles.push(filePath);
      continue;
    }
    if (
      /grafana|kibana|splunk|datadog.*dashboard|dashboard.*url|bullboard|BullBoard|@BullBoard\(/m.test(
        content,
      )
    ) {
      catalogFiles.push(filePath);
    }
  }
  if (catalogFiles.length > 0) {
    return {
      status: 'partial',
      sourceKind: 'catalog',
      source: 'dashboard catalog',
      reason: 'Dashboard references are catalog/configuration, not observed runtime evidence.',
      filePaths: catalogFiles,
    };
  }
  if (simulatedFiles.length > 0) {
    return {
      status: 'missing',
      sourceKind: 'simulated',
      source: 'simulated observability marker',
      reason: 'Only simulated dashboard evidence was found.',
      filePaths: simulatedFiles,
    };
  }
  return missingEvidence('No dashboard catalog entry was found.');
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
      (c) => c.runtimeCritical && c.pillars.alerts === 'missing' && c.overallStatus !== 'covered',
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
    machineImprovementSignals: capabilityItems.reduce(
      (sum, item) => sum + item.machineImprovementSignals.length,
      0,
    ),
  };
}
