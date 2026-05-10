/**
 * PULSE Observability Coverage Engine — Core Primitives
 *
 * Imports, constants, interfaces, helpers, and runtime-context loading
 * used across all other observability-coverage chunks.
 */

import * as path from 'node:path';
import { safeJoin, safeResolve } from '../safe-path';
import { pathExists, readJsonFile } from '../safe-fs';
import { deriveZeroValue } from '../dynamic-reality-kernel/catalog-arithmetic';
import { discoverAllObservedArtifactFilenames } from '../dynamic-reality-kernel/token-evidence';
import { deriveStringUnionMembersFromTypeContract } from '../dynamic-reality-kernel/type-contract-labels';
import type {
  ObservabilityEvidenceKind,
  ObservabilityPillar,
  ObservabilityStatus,
} from '../types.observability-coverage';
import type { PulseObservabilityEvidence } from '../types.scenario-result';
import type { PulseRuntimeEvidence } from '../types.convergence';
import type { BehaviorGraph, BehaviorNode } from '../types.behavior-graph';
import type { RuntimeFusionState, RuntimeSignal } from '../types.runtime-fusion';

export const ARTIFACT_FILE_NAME = 'PULSE_OBSERVABILITY_COVERAGE.json';

export const STRUCTURED_LOG_FIELDS = [
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

export interface PillarScanResult {
  status: ObservabilityStatus;
  sourceKind: ObservabilityEvidenceKind;
  source: string;
  reason: string;
  filePaths: string[];
}

export interface ObservabilityRuntimeContext {
  pillars: ObservabilityPillar[];
  observabilityEvidence: PulseObservabilityEvidence | null;
  runtimeEvidence: PulseRuntimeEvidence | null;
  runtimeFusion: RuntimeFusionState | null;
  behaviorGraph: BehaviorGraph | null;
  behaviorNodesByFile: Map<string, BehaviorNode[]>;
  runtimeSignalsByCapability: Map<string, RuntimeSignal[]>;
  runtimeSignalsByFlow: Map<string, RuntimeSignal[]>;
}

export const TRUSTED_OBSERVED_KINDS = new Set<ObservabilityEvidenceKind>([
  'runtime_observed',
  'static_instrumentation',
]);

export const UNTRUSTED_PRESENT_KINDS = new Set<ObservabilityEvidenceKind>([
  'configuration',
  'catalog',
  'simulated',
]);

export function containsSimulatedObservabilitySource(content: string): boolean {
  return /\b(PULSE_SIMULATED_OBSERVABILITY|SIMULATED_OBSERVABILITY|mockObservability|fakeObservability|simulatedObservability|observabilityMock)\b/i.test(
    content,
  );
}

export function missingEvidence(reason: string): PillarScanResult {
  return {
    status: 'missing',
    sourceKind: 'absent',
    source: 'none',
    reason,
    filePaths: [],
  };
}

export function normalizeStatusForEvidence(
  status: ObservabilityStatus,
  sourceKind: ObservabilityEvidenceKind,
): ObservabilityStatus {
  if (sourceKind === 'not_applicable') return 'not_applicable';
  if (sourceKind === 'absent' || sourceKind === 'simulated') return 'missing';
  if (sourceKind === 'configuration' || sourceKind === 'catalog') return 'partial';
  return status;
}

export function toRepoRelativePath(rootDir: string, filePath: string): string {
  const relativePath = path.relative(safeResolve(rootDir), safeResolve(filePath));
  if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    return filePath;
  }
  return relativePath.split(path.sep).join('/');
}

export function resolveCapabilityFiles(
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

export function isRecord(value: unknown): value is Record<string, unknown> {
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

function deriveObservabilityPillars(_rootDir: string): ObservabilityPillar[] {
  return [
    ...deriveStringUnionMembersFromTypeContract(
      'scripts/pulse/types.observability-coverage.ts',
      'ObservabilityPillar',
    ),
  ] as ObservabilityPillar[];
}

export function tokenizeObservabilityTerm(value: string): Set<string> {
  return new Set(
    value
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/[_./:-]+/g, ' ')
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean),
  );
}

export function tokenOverlap(left: Set<string>, right: Set<string>): number {
  let overlap = 0;
  for (const token of left) {
    if (right.has(token)) overlap++;
  }
  return overlap;
}

export function findPillarByTerm(
  pillars: ObservabilityPillar[],
  term: string,
): ObservabilityPillar | null {
  const termTokens = tokenizeObservabilityTerm(term);
  return (
    pillars.find(
      (pillar) => tokenOverlap(tokenizeObservabilityTerm(pillar), termTokens) > deriveZeroValue(),
    ) ?? null
  );
}

export function statusForDerivedPillar(
  pillars: Record<ObservabilityPillar, ObservabilityStatus>,
  availablePillars: ObservabilityPillar[],
  term: string,
): ObservabilityStatus {
  const pillar = findPillarByTerm(availablePillars, term);
  return pillar ? pillars[pillar] : 'not_applicable';
}

export function signalMatchesPillar(signalName: string, pillar: ObservabilityPillar): boolean {
  const signalTokens = tokenizeObservabilityTerm(signalName);
  const pillarTokens = tokenizeObservabilityTerm(pillar);
  return tokenOverlap(signalTokens, pillarTokens) > deriveZeroValue();
}

export function observabilitySignalForPillar(
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

export function loadObservabilityRuntimeContext(
  rootDir: string,
  pulseCurrentDir: string,
): ObservabilityRuntimeContext {
  const ARTIFACT = discoverAllObservedArtifactFilenames();
  const runtimeFusion = readPulseArtifact<RuntimeFusionState>(
    pulseCurrentDir,
    ARTIFACT.runtimeFusion,
  );
  const behaviorGraph = readPulseArtifact<BehaviorGraph>(pulseCurrentDir, ARTIFACT.behaviorGraph);
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
      ARTIFACT.observabilityEvidence,
    ),
    runtimeEvidence: readPulseArtifact<PulseRuntimeEvidence>(
      pulseCurrentDir,
      ARTIFACT.runtimeEvidence,
    ),
    runtimeFusion,
    behaviorGraph,
    behaviorNodesByFile,
    runtimeSignalsByCapability,
    runtimeSignalsByFlow,
  };
}
