import type {
  PulseAutonomyIterationRecord,
  PulseAutonomyState,
  PulseAutonomyUnitSnapshot,
} from '../../types';
import type {
  PulseAgentOrchestrationBatchRecord,
  PulseAgentOrchestrationState,
  PulseAutonomyArtifactSeedInput,
  PulseAgentOrchestrationArtifactSeedInput,
} from '../../autonomy-loop.types';
import {
  DEFAULT_MAX_ITERATIONS,
  DEFAULT_PARALLEL_AGENTS,
  DEFAULT_MAX_WORKER_RETRIES,
} from '../../autonomy-loop.types';
import { toUnitSnapshot } from '../../autonomy-loop.unit-ranking';
import { fingerprintStrategy } from '../../structural-memory';
import { readDirectiveArtifact } from './directive';
import { readQueueInfluence } from './queue-influence';
import {
  getMemoryAwarePreferredAutomationSafeUnits,
  selectMemoryAwareParallelUnits,
} from './unit-selection';

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

/** Build pulse autonomy state seed. */
export function buildPulseAutonomyStateSeed(
  input: PulseAutonomyArtifactSeedInput,
): PulseAutonomyState {
  const { directive } = input;
  const previousState = input.previousState as LegacyPulseAutonomyState | null | undefined;
  const blockedUnits = directive.blockedUnits || [];
  const history = buildSeedHistory(previousState);
  const riskProfile = input.riskProfile || previousState?.riskProfile || 'balanced';
  const rootDir = input.rootDir ?? process.cwd();
  const nextActionableUnit = toUnitSnapshot(
    getMemoryAwarePreferredAutomationSafeUnits(
      rootDir,
      directive,
      riskProfile,
      previousState,
      input.plannerMode || previousState?.plannerMode || 'deterministic',
    )[0] || null,
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
      : normalizeAutonomyStopReason(
          directive.autonomyReadiness?.blockers?.join(' ') || previousState?.stopReason || null,
        ),
    nextActionableUnit,
    governedSandboxUnits: countGovernedSandboxUnits(blockedUnits, previousState),
    escalatedValidationUnits: countBlockedUnitsByMode(blockedUnits, 'escalated_validation'),
    observationOnlyUnits: countObservationOnlyUnits(blockedUnits),
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
  const preferredUnits = selectMemoryAwareParallelUnits(
    input.rootDir ?? process.cwd(),
    directive,
    input.parallelAgents || previousState?.parallelAgents || DEFAULT_PARALLEL_AGENTS,
    riskProfile,
    null,
    input.plannerMode || previousState?.plannerMode || 'deterministic',
  );
  const nextBatchUnits = preferredUnits
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
      : normalizeAutonomyStopReason(
          directive.autonomyReadiness?.blockers?.join(' ') || previousState?.stopReason || null,
        ),
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
