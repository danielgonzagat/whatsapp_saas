/**
 * Internal helpers extracted from autonomy-loop.ts.
 * Not part of the public barrel — only consumed by main-loop.ts.
 */
import type {
  PulseAgentOrchestrationState,
  PulseAutonomyIterationRecord,
  PulseAutonomyState,
  PulseAutonomyValidationCommandResult,
} from '../../types';
import {
  DEFAULT_MAX_ITERATIONS,
  DEFAULT_INTERVAL_MS,
  DEFAULT_PARALLEL_AGENTS,
  DEFAULT_MAX_WORKER_RETRIES,
  DEFAULT_PLANNER_MODEL,
  type PulseAutonomousDirective,
  type PulseAutonomousDirectiveUnit,
  type PulseAutonomySummarySnapshot,
  type PulseAutonomyRunOptions,
} from '../../autonomy-loop.types';
import { coercePositiveInt } from '../../autonomy-loop.utils';
import { toUnitSnapshot } from '../../autonomy-loop.unit-ranking';
import {
  directiveDigest,
  getMemoryAwarePreferredAutomationSafeUnits,
  buildPulseAutonomyStateSeed,
  buildPulseAgentOrchestrationStateSeed,
  writePulseAutonomyState,
  writePulseAgentOrchestrationState,
  loadPulseAutonomyState,
  loadPulseAgentOrchestrationState,
  appendHistory,
  runPulseGuidance,
} from '../../autonomy-loop.state-io';
import { detectRollbackGuard } from '../../autonomy-loop.workspace';
import {
  captureRegressionSnapshot,
  detectRegression,
  detectChangedFilesSinceHead,
  rollbackRegression,
  type PulseSnapshot,
} from '../../regression-guard';
import type { ExecutorKind } from '../../executor';
import {
  deriveStringUnionMembersFromTypeContract,
  deriveUnitValue,
  deriveZeroValue,
  discoverConvergenceUnitStatusLabels,
} from '../../dynamic-reality-kernel';

// ── certifiedConvergenceLabel ──────────────────────────────────────────────────

export const certifiedConvergenceLabel = (() => {
  const labels = discoverConvergenceUnitStatusLabels();
  return [...labels][0];
})();

// ── buildRunOptions ────────────────────────────────────────────────────────────

export function buildRunOptions(
  rootDir: string,
  flags: {
    dryRun?: boolean;
    continuous?: boolean;
    maxIterations?: number | null;
    intervalMs?: number | null;
    parallelAgents?: number | null;
    maxWorkerRetries?: number | null;
    riskProfile?: 'safe' | 'balanced' | 'dangerous' | null;
    plannerModel?: string | null;
    codexModel?: string | null;
    disableAgentPlanner?: boolean;
    executor?: ExecutorKind | null;
  },
): PulseAutonomyRunOptions {
  const validateCommands = process.env.PULSE_AUTONOMY_VALIDATE
    ? process.env.PULSE_AUTONOMY_VALIDATE.split(';;')
        .map((entry) => entry.trim())
        .filter(Boolean)
    : [];

  const riskLabelSet = deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/autonomy-loop.types.ts',
    'riskProfile',
  );
  const defaultRiskLabel = ([...riskLabelSet][deriveUnitValue()] ||
    [...riskLabelSet][0]) as PulseAutonomyRunOptions['riskProfile'];

  return {
    rootDir,
    dryRun: Boolean(flags.dryRun),
    continuous: Boolean(flags.continuous),
    maxIterations:
      flags.maxIterations ||
      coercePositiveInt(process.env.PULSE_AUTONOMY_MAX_ITERATIONS, DEFAULT_MAX_ITERATIONS),
    intervalMs:
      flags.intervalMs ||
      coercePositiveInt(process.env.PULSE_AUTONOMY_INTERVAL_MS, DEFAULT_INTERVAL_MS),
    parallelAgents:
      flags.parallelAgents ||
      coercePositiveInt(process.env.PULSE_AUTONOMY_PARALLEL_AGENTS, DEFAULT_PARALLEL_AGENTS),
    maxWorkerRetries:
      flags.maxWorkerRetries ||
      coercePositiveInt(process.env.PULSE_AUTONOMY_MAX_WORKER_RETRIES, DEFAULT_MAX_WORKER_RETRIES),
    riskProfile:
      flags.riskProfile ||
      (process.env.PULSE_AUTONOMY_RISK_PROFILE &&
      riskLabelSet.has(process.env.PULSE_AUTONOMY_RISK_PROFILE)
        ? (process.env.PULSE_AUTONOMY_RISK_PROFILE as PulseAutonomyRunOptions['riskProfile'])
        : defaultRiskLabel),
    plannerModel: flags.plannerModel || process.env.PULSE_AUTONOMY_MODEL || DEFAULT_PLANNER_MODEL,
    codexModel: flags.codexModel || process.env.PULSE_AUTONOMY_CODEX_MODEL || null,
    disableAgentPlanner:
      Boolean(flags.disableAgentPlanner) ||
      process.env.PULSE_AUTONOMY_DISABLE_AGENT_PLANNER === String(deriveUnitValue()),
    executor: flags.executor || null,
    validateCommands,
  };
}

// ── bootstrapSingleAgentLoop ──────────────────────────────────────────────────

export function bootstrapSingleAgentLoop(
  rootDir: string,
  options: PulseAutonomyRunOptions,
  codexCliAvailable: boolean,
  agentsSdkVersion: string | null,
  plannerMode: PulseAutonomyState['plannerMode'],
): { state: PulseAutonomyState; rollbackGuard: { enabled: boolean; reason: string } } {
  const rollbackGuard = detectRollbackGuard(rootDir);
  const previousState = loadPulseAutonomyState(rootDir);
  const previousOrchestrationState = loadPulseAgentOrchestrationState(rootDir);
  const initialDirective = runPulseGuidance(rootDir);
  let state = buildPulseAutonomyStateSeed({
    rootDir,
    directive: initialDirective,
    previousState,
    codexCliAvailable,
    orchestrationMode: 'single',
    parallelAgents: options.parallelAgents,
    maxWorkerRetries: options.maxWorkerRetries,
    riskProfile: options.riskProfile,
    plannerMode,
    plannerModel: options.plannerModel,
    codexModel: options.codexModel,
  });
  let orchestrationState: PulseAgentOrchestrationState = buildPulseAgentOrchestrationStateSeed({
    directive: initialDirective,
    previousState: previousOrchestrationState,
    codexCliAvailable,
    parallelAgents: options.parallelAgents,
    maxWorkerRetries: options.maxWorkerRetries,
    riskProfile: options.riskProfile,
    plannerMode,
  });

  const runnerInfo = {
    agentsSdkAvailable: Boolean(agentsSdkVersion),
    agentsSdkVersion,
    openAiApiKeyConfigured: Boolean(process.env.OPENAI_API_KEY),
    codexCliAvailable,
  };
  state = {
    ...state,
    status: 'running',
    continuous: options.continuous,
    maxIterations: options.maxIterations,
    parallelAgents: options.parallelAgents,
    maxWorkerRetries: options.maxWorkerRetries,
    orchestrationMode: 'single',
    riskProfile: options.riskProfile,
    plannerMode,
    plannerModel: options.plannerModel,
    codexModel: options.codexModel,
    runner: runnerInfo,
    stopReason: null,
  };
  orchestrationState = {
    ...orchestrationState,
    status: 'idle',
    continuous: options.continuous,
    maxIterations: options.maxIterations,
    parallelAgents: options.parallelAgents,
    maxWorkerRetries: options.maxWorkerRetries,
    riskProfile: options.riskProfile,
    runner: runnerInfo,
  };
  writePulseAutonomyState(rootDir, state);
  writePulseAgentOrchestrationState(rootDir, orchestrationState);

  return { state, rollbackGuard };
}

// ── handleRegressionGuard ─────────────────────────────────────────────────────

export async function handleRegressionGuard(
  rootDir: string,
  dryRun: boolean,
  codexExecuted: boolean,
  regressionBefore: PulseSnapshot | null,
  riskProfile: 'safe' | 'balanced' | 'dangerous',
  rollbackGuard: { enabled: boolean; reason: string },
  state: PulseAutonomyState,
  iterationRecord: PulseAutonomyIterationRecord,
  directiveAfter: {
    generatedAt?: string;
    currentCheckpoint?: Record<string, unknown> | null;
    targetCheckpoint?: Record<string, unknown> | null;
    visionGap?: string | null;
  },
  plannerMode: PulseAutonomyState['plannerMode'],
): Promise<PulseAutonomyState | null> {
  if (!dryRun && codexExecuted && regressionBefore) {
    const regressionAfter = captureRegressionSnapshot(rootDir);
    const regressionResult = detectRegression(regressionBefore, regressionAfter);
    if (regressionResult.regressed) {
      // Snapshot the files this unit touched BEFORE rollback so we can scope it.
      const changedFiles = detectChangedFilesSinceHead(rootDir);
      const reason = `RegressionGuard: ${regressionResult.reasons.join(' | ')}`;
      const rollbackOutcome = rollbackGuard.enabled
        ? rollbackRegression(rootDir, changedFiles, reason)
        : {
            attempted: false,
            skipped: true,
            revertedFiles: [],
            removedUntracked: [],
            summary: `Rollback skipped: ${rollbackGuard.reason}`,
          };

      const failedRecord: PulseAutonomyIterationRecord = {
        ...iterationRecord,
        status: 'failed',
        improved: false,
        summary: `${iterationRecord.summary} ${reason} ${rollbackOutcome.summary}`.trim(),
      };
      let updatedState = appendHistory(state, failedRecord);
      updatedState = {
        ...updatedState,
        generatedAt: new Date().toISOString(),
        guidanceGeneratedAt: directiveAfter.generatedAt || updatedState.guidanceGeneratedAt,
        currentCheckpoint: directiveAfter.currentCheckpoint || updatedState.currentCheckpoint,
        targetCheckpoint: directiveAfter.targetCheckpoint || updatedState.targetCheckpoint,
        visionGap: directiveAfter.visionGap || updatedState.visionGap,
        nextActionableUnit: toUnitSnapshot(
          getMemoryAwarePreferredAutomationSafeUnits(
            rootDir,
            directiveAfter,
            riskProfile,
            updatedState,
            plannerMode,
          )[0] || null,
        ),
        status: 'failed',
        stopReason: `${reason} | ${rollbackOutcome.summary}`,
      };
      writePulseAutonomyState(rootDir, updatedState);
      return updatedState;
    }
  }
  return null;
}

// ── buildIterationRecord ──────────────────────────────────────────────────────

export function buildIterationRecord(
  state: PulseAutonomyState,
  plannerMode: PulseAutonomyState['plannerMode'],
  strategyMode: 'normal' | 'adaptive_narrow_scope',
  iterationStatus: PulseAutonomyIterationRecord['status'],
  iterationStartedAt: string,
  dryRun: boolean,
  improved: boolean,
  selectedUnit: PulseAutonomousDirectiveUnit,
  directiveBefore: PulseAutonomousDirective,
  directiveAfter: PulseAutonomousDirective,
  beforeSnapshot: PulseAutonomySummarySnapshot,
  afterSnapshot: PulseAutonomySummarySnapshot,
  rollbackSummary: string | null,
  codexResult: {
    executed: boolean;
    command: string | null;
    exitCode: number | null;
    finalMessage: string | null;
  },
  validationResults: PulseAutonomyValidationCommandResult[],
): PulseAutonomyIterationRecord {
  return {
    iteration: state.completedIterations + deriveUnitValue(),
    plannerMode,
    strategyMode,
    status: iterationStatus,
    startedAt: iterationStartedAt,
    finishedAt: new Date().toISOString(),
    summary: dryRun
      ? `Planned ${selectedUnit.title} without executing Codex because dry-run is enabled.`
      : improved
        ? `Executed ${selectedUnit.title} and Pulse changed after validation.`
        : `Executed ${selectedUnit.title} but Pulse did not materially change after validation.${rollbackSummary ? ` ${rollbackSummary}` : ''}`,
    improved,
    unit: toUnitSnapshot(selectedUnit),
    directiveDigestBefore: directiveDigest(directiveBefore),
    directiveDigestAfter: directiveDigest(directiveAfter),
    directiveBefore: beforeSnapshot,
    directiveAfter: afterSnapshot,
    executionMatrixSummaryBefore: beforeSnapshot.executionMatrixSummary ?? null,
    executionMatrixSummaryAfter: afterSnapshot.executionMatrixSummary ?? null,
    codex: codexResult,
    validation: {
      executed: !dryRun,
      commands: validationResults,
    },
  };
}
