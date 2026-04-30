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

function findPillarByTerm(
  pillars: ObservabilityPillar[],
  term: string,
): ObservabilityPillar | null {
  const termTokens = tokenizeObservabilityTerm(term);
  return (
    pillars.find((pillar) => tokenOverlap(tokenizeObservabilityTerm(pillar), termTokens) > 0) ??
    null
  );
}

function statusForDerivedPillar(
  pillars: Record<ObservabilityPillar, ObservabilityStatus>,
  availablePillars: ObservabilityPillar[],
  term: string,
): ObservabilityStatus {
  const pillar = findPillarByTerm(availablePillars, term);
  return pillar ? pillars[pillar] : 'not_applicable';
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
  const flowItems = buildFlowObservability(flows, capabilityItems, runtimeContext);

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
import "./__companions__/observability-coverage.companion";
