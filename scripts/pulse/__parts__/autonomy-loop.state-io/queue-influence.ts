import * as path from 'node:path';
import type {
  PulseAutonomyMemoryConcept,
  PulseAutonomyMemoryState,
  PulseAutonomyState,
} from '../../types';
import type { PulseAutonomousDirective } from '../../autonomy-loop.types';
import { readOptionalArtifact, getAutonomyMemoryArtifactPath } from '../../autonomy-loop.utils';
import {
  buildStructuralQueueInfluence,
  buildRuntimeRealityQueueInfluence,
} from '../../autonomy-loop.unit-ranking';
import { buildPulseAutonomyMemoryState } from '../../autonomy-loop.memory';
import { fingerprintStrategy } from '../../structural-memory';
import type { FalsePositiveAdjudicationState } from '../../types.false-positive-adjudicator';
import type { RuntimeFusionState } from '../../types.runtime-fusion';
import type { StructuralMemoryState } from '../../types.structural-memory';

export function readStructuralQueueInfluence(
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

export function readQueueInfluence(
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

export function readAutonomyMemoryConcepts(
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

export function unitHasRepeatedFailedAutonomyStrategy(
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

export function unitIsBlockedByMemory(
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
