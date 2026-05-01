/**
 * State read/write, seed builders, and directive IO for the autonomy loop.
 */
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import type {
  PulseAgentOrchestrationBatchRecord,
  PulseAgentOrchestrationState,
  PulseAutonomyIterationRecord,
  PulseAutonomyMemoryConcept,
  PulseAutonomyMemoryState,
  PulseAutonomyState,
  PulseAutonomyUnitSnapshot,
} from './types';
import type {
  PulseAutonomousDirective,
  PulseAutonomousDirectiveUnit,
  PulseAutonomyArtifactSeedInput,
  PulseAgentOrchestrationArtifactSeedInput,
  PulseAutonomySummarySnapshot,
} from './autonomy-loop.types';
import {
  DEFAULT_MAX_ITERATIONS,
  DEFAULT_PARALLEL_AGENTS,
  DEFAULT_MAX_WORKER_RETRIES,
} from './autonomy-loop.types';
import {
  getAutonomyArtifactPath,
  getAutonomyMemoryArtifactPath,
  getAgentOrchestrationArtifactPath,
  readOptionalArtifact,
  writeAtomicArtifact,
  compact,
} from './autonomy-loop.utils';
import {
  toUnitSnapshot,
  getPreferredAutomationSafeUnits,
  hasUnitConflict,
  buildStructuralQueueInfluence,
  buildRuntimeRealityQueueInfluence,
} from './autonomy-loop.unit-ranking';
import { buildPulseAutonomyMemoryState } from './autonomy-loop.memory';
import { fingerprintStrategy } from './structural-memory';
import type { FalsePositiveAdjudicationState } from './types.false-positive-adjudicator';
import type { RuntimeFusionState } from './types.runtime-fusion';
import type { StructuralMemoryState } from './types.structural-memory';

export function directiveDigest(directive: PulseAutonomousDirective): string {
  const crypto = require('node:crypto') as typeof import('node:crypto');
  return crypto
    .createHash('sha1')
    .update(
      JSON.stringify({
        currentCheckpoint: directive.currentCheckpoint || null,
        currentState: directive.currentState || null,
        visionGap: directive.visionGap || null,
        nextExecutableUnits: directive.nextExecutableUnits || [],
        blockedUnits: directive.blockedUnits || [],
      }),
    )
    .digest('hex');
}

export function getDirectiveSnapshot(
  directive: PulseAutonomousDirective,
): PulseAutonomySummarySnapshot {
  const executionMatrixSummary =
    directive.executionMatrix?.summary ??
    (
      directive.currentState as {
        executionMatrixSummary?: PulseAutonomySummarySnapshot['executionMatrixSummary'];
      } | null
    )?.executionMatrixSummary ??
    null;

  return {
    certificationStatus: directive.currentState?.certificationStatus || null,
    blockingTier:
      typeof directive.currentState?.blockingTier === 'number'
        ? directive.currentState.blockingTier
        : null,
    score: typeof directive.currentState?.score === 'number' ? directive.currentState.score : null,
    visionGap: directive.visionGap || null,
    executionMatrixSummary,
  };
}

export function readDirectiveArtifact(rootDir: string): PulseAutonomousDirective | null {
  const canonicalPath = path.join(rootDir, '.pulse', 'current', 'PULSE_CLI_DIRECTIVE.json');
  const mirrorPath = path.join(rootDir, 'PULSE_CLI_DIRECTIVE.json');
  return (
    readOptionalArtifact<PulseAutonomousDirective>(canonicalPath) ||
    readOptionalArtifact<PulseAutonomousDirective>(mirrorPath)
  );
}

function readStructuralQueueInfluence(
  rootDir: string,
): ReturnType<typeof buildStructuralQueueInfluence> {
  const currentDir = path.join(rootDir, '.pulse', 'current');
  const memory = readOptionalArtifact<StructuralMemoryState>(
    path.join(currentDir, 'PULSE_STRUCTURAL_MEMORY.json'),
  );
  const adjudication = readOptionalArtifact<FalsePositiveAdjudicationState>(
    path.join(currentDir, 'PULSE_FP_ADJUDICATION.json'),
  );
  return buildStructuralQueueInfluence(memory, adjudication);
}

function readRuntimeFusionState(rootDir: string): RuntimeFusionState | null {
  return readOptionalArtifact<RuntimeFusionState>(
    path.join(rootDir, '.pulse', 'current', 'PULSE_RUNTIME_FUSION.json'),
  );
}

function readQueueInfluence(
  rootDir: string,
  directive: PulseAutonomousDirective,
): ReturnType<typeof buildStructuralQueueInfluence> {
  const influence = readStructuralQueueInfluence(rootDir);
  const runtimeInfluence = buildRuntimeRealityQueueInfluence(
    directive,
    readRuntimeFusionState(rootDir),
  );
  for (const [unitId, metadata] of runtimeInfluence.runtimeRealityByUnitId.entries()) {
    influence.runtimeRealityByUnitId.set(unitId, metadata);
  }
  return influence;
}

function readAutonomyMemoryConcepts(
  rootDir: string,
  previousState?: PulseAutonomyState | null,
): PulseAutonomyMemoryConcept[] {
  const artifact = readOptionalArtifact<PulseAutonomyMemoryState>(
    getAutonomyMemoryArtifactPath(rootDir),
  );
  const derived = buildPulseAutonomyMemoryState({
    autonomyState: previousState ?? null,
  });
  const conceptsById = new Map<string, PulseAutonomyMemoryConcept>();
  for (const concept of [...(artifact?.concepts || []), ...derived.concepts]) {
    conceptsById.set(concept.id, concept);
  }
  return [...conceptsById.values()];
}

function unitHasRepeatedFailedAutonomyStrategy(
  unitId: string,
  concepts: PulseAutonomyMemoryConcept[],
  currentStrategy: string,
  currentStrategyFingerprint: string,
): boolean {
  return concepts.some((concept) => {
    if (
      concept.suggestedStrategy !== 'escalated_validation' ||
      !concept.id.startsWith(`repeated-failed-strategy-${unitId}-`) ||
      !concept.unitIds.includes(unitId)
    ) {
      return false;
    }
    return (
      concept.id.endsWith(currentStrategyFingerprint) || concept.summary.includes(currentStrategy)
    );
  });
}

function unitIsBlockedByMemory(
  unitId: string,
  structuralInfluence: ReturnType<typeof buildStructuralQueueInfluence>,
  autonomyConcepts: PulseAutonomyMemoryConcept[],
  currentStrategy: string,
): boolean {
  const recommendedStrategy = structuralInfluence.strategyByUnitId.get(unitId);
  if (recommendedStrategy === 'observation_only') {
    return true;
  }

  const currentStrategyFingerprint = fingerprintStrategy(currentStrategy);
  if (
    recommendedStrategy?.startsWith('avoid_strategy_fingerprint:') &&
    recommendedStrategy.slice('avoid_strategy_fingerprint:'.length) === currentStrategyFingerprint
  ) {
    return true;
  }

  return unitHasRepeatedFailedAutonomyStrategy(
    unitId,
    autonomyConcepts,
    currentStrategy,
    currentStrategyFingerprint,
  );
}

export function getMemoryAwarePreferredAutomationSafeUnits(
  rootDir: string,
  directive: PulseAutonomousDirective,
  riskProfile: 'safe' | 'balanced' | 'dangerous',
  previousState?: PulseAutonomyState | null,
  plannerMode: 'agents_sdk' | 'deterministic' = 'deterministic',
  strategyMode: 'normal' | 'adaptive_narrow_scope' = 'normal',
): PulseAutonomousDirectiveUnit[] {
  const structuralInfluence = readQueueInfluence(rootDir, directive);
  const autonomyConcepts = readAutonomyMemoryConcepts(rootDir, previousState);
  const currentStrategy = `${strategyMode}_${plannerMode}`;

  return getPreferredAutomationSafeUnits(
    directive,
    riskProfile,
    previousState,
    structuralInfluence,
  ).filter(
    (unit) =>
      !unitIsBlockedByMemory(unit.id, structuralInfluence, autonomyConcepts, currentStrategy),
  );
}

export function selectMemoryAwareParallelUnits(
  rootDir: string,
  directive: PulseAutonomousDirective,
  parallelAgents: number,
  riskProfile: 'safe' | 'balanced' | 'dangerous',
  previousState?: PulseAutonomyState | null,
  plannerMode: 'agents_sdk' | 'deterministic' = 'deterministic',
  strategyMode: 'normal' | 'adaptive_narrow_scope' = 'normal',
): PulseAutonomousDirectiveUnit[] {
  const preferredUnits = getMemoryAwarePreferredAutomationSafeUnits(
    rootDir,
    directive,
    riskProfile,
    previousState,
    plannerMode,
    strategyMode,
  );
  if (parallelAgents <= 1 || preferredUnits.length <= 1) {
    return preferredUnits.slice(0, 1);
  }

  const selected: PulseAutonomousDirectiveUnit[] = [];
  for (const unit of preferredUnits) {
    if (selected.length >= parallelAgents) break;
    if (selected.length === 0 || !hasUnitConflict(unit, selected)) {
      selected.push(unit);
    }
  }

  return selected.length > 0 ? selected : preferredUnits.slice(0, 1);
}

export function runPulseGuidance(rootDir: string): PulseAutonomousDirective {
  const result = spawnSync('node', ['scripts/pulse/run.js', '--guidance'], {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.status !== 0) {
    throw new Error(compact(result.stderr || result.stdout || 'PULSE guidance failed.', 800));
  }

  const directive = readDirectiveArtifact(rootDir);
  if (!directive) {
    throw new Error('PULSE guidance finished but did not leave a canonical directive artifact.');
  }

  return directive;
}

function buildSeedHistory(
  previousState?: PulseAutonomyState | null,
): PulseAutonomyIterationRecord[] {
  return previousState?.history?.slice(-20) || [];
}

type AutonomousBlockedExecutionMode =
  | 'ai_safe'
  | 'governed_sandbox'
  | 'observation_only'
  | 'escalated_validation';

interface LegacyPulseAutonomyState extends Omit<PulseAutonomyState, 'humanRequiredUnits'> {
  humanRequiredUnits?: number;
}

function normalizeBlockedExecutionMode(mode?: string | null): AutonomousBlockedExecutionMode {
  if (mode === 'ai_safe') {
    return 'ai_safe';
  }
  if (
    mode === 'governed_sandbox' ||
    mode === 'human_required' ||
    mode === 'blocked_human_required'
  ) {
    return 'governed_sandbox';
  }
  if (mode === 'escalated_validation') {
    return 'escalated_validation';
  }
  return 'observation_only';
}

function countBlockedUnitsByMode(
  units: Array<{ executionMode?: string }>,
  mode: AutonomousBlockedExecutionMode,
): number {
  return units.filter((unit) => normalizeBlockedExecutionMode(unit.executionMode) === mode).length;
}

function countObservationOnlyUnits(units: Array<{ executionMode?: string }>): number {
  return units.filter(
    (unit) => normalizeBlockedExecutionMode(unit.executionMode) === 'observation_only',
  ).length;
}

function previousGovernedSandboxUnits(previousState?: LegacyPulseAutonomyState | null): number {
  return previousState?.governedSandboxUnits ?? previousState?.humanRequiredUnits ?? 0;
}

function countGovernedSandboxUnits(
  units: Array<{ executionMode?: string }>,
  previousState?: LegacyPulseAutonomyState | null,
): number {
  const currentCount = countBlockedUnitsByMode(units, 'governed_sandbox');
  return units.length > 0 ? currentCount : previousGovernedSandboxUnits(previousState);
}

function normalizeAutonomyStopReason(reason: string | null | undefined): string | null {
  if (!reason) {
    return null;
  }
  return reason
    .replaceAll('blocked_human_required', 'governed_sandbox')
    .replaceAll('human_required', 'governed_sandbox')
    .replaceAll('needs_human_review', 'escalated_validation')
    .replaceAll('human review', 'escalated validation')
    .replaceAll('human blocker', 'governed sandbox boundary')
    .replaceAll('human escalation', 'governed sandbox validation');
}

import './__parts__/autonomy-loop.state-io.part';
export * from './__companions__/autonomy-loop.state-io.companion';
