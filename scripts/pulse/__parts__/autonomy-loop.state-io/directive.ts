/** State read/write, seed builders, and directive IO for the autonomy loop. */
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
} from '../../types.autonomy';
import type {
  PulseAutonomousDirective,
  PulseAutonomousDirectiveUnit,
  PulseAutonomyArtifactSeedInput,
  PulseAgentOrchestrationArtifactSeedInput,
  PulseAutonomySummarySnapshot,
} from '../../autonomy-loop.types';
import {
  DEFAULT_MAX_ITERATIONS,
  DEFAULT_PARALLEL_AGENTS,
  DEFAULT_MAX_WORKER_RETRIES,
} from '../../autonomy-loop.types';
import {
  getAutonomyArtifactPath,
  getAutonomyMemoryArtifactPath,
  getAgentOrchestrationArtifactPath,
  readOptionalArtifact,
  writeAtomicArtifact,
  compact,
} from '../../autonomy-loop.utils';
import {
  toUnitSnapshot,
  buildStructuralQueueInfluence,
} from '../../autonomy-loop.unit-ranking/__parts__/structural-rank';
import {
  getPreferredAutomationSafeUnits,
  hasUnitConflict,
} from '../../autonomy-loop.unit-ranking/__parts__/selection';
import { buildRuntimeRealityQueueInfluence } from '../../autonomy-loop.unit-ranking/__parts__/runtime-rank';
import { buildPulseAutonomyMemoryState } from '../../autonomy-loop.memory';
import { fingerprintStrategy } from '../../structural-memory/__parts__/memory-core';
import type { FalsePositiveAdjudicationState } from '../../types.false-positive-adjudicator';
import type { RuntimeFusionState } from '../../types.runtime-fusion';
import type { StructuralMemoryState } from '../../types.structural-memory';

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
