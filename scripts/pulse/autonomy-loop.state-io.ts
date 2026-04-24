/**
 * State read/write, seed builders, and directive IO for the autonomy loop.
 */
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import type {
  PulseAgentOrchestrationBatchRecord,
  PulseAgentOrchestrationState,
  PulseAutonomyIterationRecord,
  PulseAutonomyState,
  PulseAutonomyUnitSnapshot,
} from './types';
import type {
  PulseAutonomousDirective,
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
  getAiSafeUnits,
  getPreferredAutomationSafeUnits,
} from './autonomy-loop.unit-ranking';
import { buildPulseAutonomyMemoryState } from './autonomy-loop.memory';

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
  return {
    certificationStatus: directive.currentState?.certificationStatus || null,
    blockingTier:
      typeof directive.currentState?.blockingTier === 'number'
        ? directive.currentState.blockingTier
        : null,
    score: typeof directive.currentState?.score === 'number' ? directive.currentState.score : null,
    visionGap: directive.visionGap || null,
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

/** Build pulse autonomy state seed. */
export function buildPulseAutonomyStateSeed(
  input: PulseAutonomyArtifactSeedInput,
): PulseAutonomyState {
  const { directive, previousState } = input;
  const aiSafeUnits = getAiSafeUnits(directive);
  const blockedUnits = directive.blockedUnits || [];
  const history = buildSeedHistory(previousState);
  const riskProfile = input.riskProfile || previousState?.riskProfile || 'balanced';
  const nextActionableUnit = toUnitSnapshot(
    getPreferredAutomationSafeUnits(directive, riskProfile, previousState)[0] ||
      aiSafeUnits[0] ||
      null,
  );
  const canWorkNow = Boolean(nextActionableUnit) && directive.autonomyReadiness?.verdict !== 'NAO';
  const certified = directive.currentState?.certificationStatus === 'CERTIFIED';

  return {
    generatedAt: new Date().toISOString(),
    status: canWorkNow ? 'idle' : certified ? 'completed' : 'blocked',
    orchestrationMode: input.orchestrationMode || previousState?.orchestrationMode || 'single',
    riskProfile,
    plannerMode: input.plannerMode || previousState?.plannerMode || 'deterministic',
    continuous: previousState?.continuous || false,
    maxIterations: previousState?.maxIterations || DEFAULT_MAX_ITERATIONS,
    completedIterations: previousState?.completedIterations || history.length,
    parallelAgents:
      input.parallelAgents || previousState?.parallelAgents || DEFAULT_PARALLEL_AGENTS,
    maxWorkerRetries:
      input.maxWorkerRetries || previousState?.maxWorkerRetries || DEFAULT_MAX_WORKER_RETRIES,
    plannerModel: input.plannerModel ?? previousState?.plannerModel ?? null,
    codexModel: input.codexModel ?? previousState?.codexModel ?? null,
    guidanceGeneratedAt: directive.generatedAt || previousState?.guidanceGeneratedAt || null,
    currentCheckpoint: directive.currentCheckpoint || previousState?.currentCheckpoint || null,
    targetCheckpoint: directive.targetCheckpoint || previousState?.targetCheckpoint || null,
    visionGap: directive.visionGap || previousState?.visionGap || null,
    stopReason: canWorkNow
      ? null
      : directive.autonomyReadiness?.blockers?.join(' ') || previousState?.stopReason || null,
    nextActionableUnit,
    humanRequiredUnits: blockedUnits.filter((unit) => unit.executionMode === 'human_required')
      .length,
    observationOnlyUnits: blockedUnits.filter((unit) => unit.executionMode !== 'human_required')
      .length,
    runner: {
      agentsSdkAvailable: previousState?.runner?.agentsSdkAvailable ?? true,
      agentsSdkVersion: previousState?.runner?.agentsSdkVersion ?? null,
      openAiApiKeyConfigured:
        previousState?.runner?.openAiApiKeyConfigured ?? Boolean(process.env.OPENAI_API_KEY),
      codexCliAvailable: previousState?.runner?.codexCliAvailable ?? false,
    },
    history,
  };
}

function buildAgentOrchestrationSeedHistory(
  previousState?: PulseAgentOrchestrationState | null,
): PulseAgentOrchestrationBatchRecord[] {
  return previousState?.history?.slice(-20) || [];
}

/** Build pulse agent orchestration state seed. */
export function buildPulseAgentOrchestrationStateSeed(
  input: PulseAgentOrchestrationArtifactSeedInput,
): PulseAgentOrchestrationState {
  const { directive, previousState } = input;
  const history = buildAgentOrchestrationSeedHistory(previousState);
  const riskProfile = input.riskProfile || previousState?.riskProfile || 'balanced';
  const preferredUnits = getPreferredAutomationSafeUnits(directive, riskProfile);
  const nextBatchUnits = (preferredUnits.length > 0 ? preferredUnits : getAiSafeUnits(directive))
    .slice(0, input.parallelAgents || previousState?.parallelAgents || DEFAULT_PARALLEL_AGENTS)
    .map((unit) => toUnitSnapshot(unit))
    .filter((unit): unit is PulseAutonomyUnitSnapshot => Boolean(unit));
  const canWorkNow = nextBatchUnits.length > 0 && directive.autonomyReadiness?.verdict !== 'NAO';
  const certified = directive.currentState?.certificationStatus === 'CERTIFIED';

  return {
    generatedAt: new Date().toISOString(),
    status: canWorkNow ? 'idle' : certified ? 'completed' : 'blocked',
    strategy: 'capability_flow_locking',
    riskProfile,
    plannerMode: input.plannerMode || previousState?.plannerMode || 'deterministic',
    continuous: previousState?.continuous || false,
    maxIterations: previousState?.maxIterations || DEFAULT_MAX_ITERATIONS,
    completedIterations: previousState?.completedIterations || history.length,
    parallelAgents:
      input.parallelAgents || previousState?.parallelAgents || DEFAULT_PARALLEL_AGENTS,
    maxWorkerRetries:
      input.maxWorkerRetries || previousState?.maxWorkerRetries || DEFAULT_MAX_WORKER_RETRIES,
    guidanceGeneratedAt: directive.generatedAt || previousState?.guidanceGeneratedAt || null,
    currentCheckpoint: directive.currentCheckpoint || previousState?.currentCheckpoint || null,
    targetCheckpoint: directive.targetCheckpoint || previousState?.targetCheckpoint || null,
    visionGap: directive.visionGap || previousState?.visionGap || null,
    stopReason: canWorkNow
      ? null
      : directive.autonomyReadiness?.blockers?.join(' ') || previousState?.stopReason || null,
    nextBatchUnits,
    runner: {
      agentsSdkAvailable: previousState?.runner?.agentsSdkAvailable ?? true,
      agentsSdkVersion: previousState?.runner?.agentsSdkVersion ?? null,
      openAiApiKeyConfigured:
        previousState?.runner?.openAiApiKeyConfigured ?? Boolean(process.env.OPENAI_API_KEY),
      codexCliAvailable: previousState?.runner?.codexCliAvailable ?? false,
    },
    history,
  };
}

export function writePulseAutonomyState(rootDir: string, state: PulseAutonomyState): void {
  writeAtomicArtifact(getAutonomyArtifactPath(rootDir), rootDir, JSON.stringify(state, null, 2));
  const memoryState = buildPulseAutonomyMemoryState({
    autonomyState: state,
    orchestrationState: loadPulseAgentOrchestrationState(rootDir),
  });
  writeAtomicArtifact(
    getAutonomyMemoryArtifactPath(rootDir),
    rootDir,
    JSON.stringify(memoryState, null, 2),
  );
}

export function loadPulseAutonomyState(rootDir: string): PulseAutonomyState | null {
  return readOptionalArtifact<PulseAutonomyState>(getAutonomyArtifactPath(rootDir));
}

export function writePulseAgentOrchestrationState(
  rootDir: string,
  state: PulseAgentOrchestrationState,
): void {
  writeAtomicArtifact(
    getAgentOrchestrationArtifactPath(rootDir),
    rootDir,
    JSON.stringify(state, null, 2),
  );
  const memoryState = buildPulseAutonomyMemoryState({
    autonomyState: loadPulseAutonomyState(rootDir),
    orchestrationState: state,
  });
  writeAtomicArtifact(
    getAutonomyMemoryArtifactPath(rootDir),
    rootDir,
    JSON.stringify(memoryState, null, 2),
  );
}

export function loadPulseAgentOrchestrationState(
  rootDir: string,
): PulseAgentOrchestrationState | null {
  return readOptionalArtifact<PulseAgentOrchestrationState>(
    getAgentOrchestrationArtifactPath(rootDir),
  );
}

export function appendHistory(
  state: PulseAutonomyState,
  iteration: PulseAutonomyIterationRecord,
): PulseAutonomyState {
  return {
    ...state,
    history: [...state.history, iteration].slice(-20),
    completedIterations: state.completedIterations + 1,
  };
}

export function appendOrchestrationHistory(
  state: PulseAgentOrchestrationState,
  batch: PulseAgentOrchestrationBatchRecord,
): PulseAgentOrchestrationState {
  return {
    ...state,
    history: [...state.history, batch].slice(-20),
    completedIterations: state.completedIterations + 1,
  };
}
