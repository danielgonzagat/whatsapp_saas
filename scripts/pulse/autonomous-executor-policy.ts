export type AutonomousDaemonMode = 'planner' | 'executor';

export type ExecutorCycleMaterialityStatus = 'accepted_material' | 'planned_only' | 'rejected';

export interface SandboxExecutionResult {
  executed: boolean;
  isolatedWorktree: boolean;
  workspacePath: string | null;
  exitCode: number | null;
  summary: string;
}

export interface ExecutorValidationCommandResult {
  command: string;
  exitCode: number;
}

export interface ExecutorValidationResult {
  executed: boolean;
  passed: boolean;
  commands: readonly ExecutorValidationCommandResult[];
}

export interface BeforeAfterMetric {
  name: string;
  before: number;
  after: number;
  improved: boolean;
}

export interface ExecutorCycleMaterialityInput {
  daemonMode: AutonomousDaemonMode;
  sandboxResult: SandboxExecutionResult | null;
  validationResult: ExecutorValidationResult | null;
  beforeAfterMetric: BeforeAfterMetric | null;
}

export interface ExecutorCycleMaterialityDecision {
  status: ExecutorCycleMaterialityStatus;
  acceptedMaterial: boolean;
  reason: string;
  missingEvidence: string[];
}

function hasPassingSandbox(result: SandboxExecutionResult | null): boolean {
  return Boolean(
    result?.executed && result.isolatedWorktree && result.workspacePath && result.exitCode === 0,
  );
}

function hasPassingValidation(result: ExecutorValidationResult | null): boolean {
  return Boolean(
    result?.executed &&
    result.passed &&
    result.commands.length > 0 &&
    result.commands.every((command) => command.exitCode === 0),
  );
}

function hasMaterialMetric(metric: BeforeAfterMetric | null): boolean {
  return Boolean(metric && metric.improved && metric.before !== metric.after);
}

export function evaluateExecutorCycleMateriality(
  input: ExecutorCycleMaterialityInput,
): ExecutorCycleMaterialityDecision {
  if (input.daemonMode === 'planner') {
    return {
      status: 'planned_only',
      acceptedMaterial: false,
      reason:
        'Planner daemon cycles can record intent only; material acceptance requires executor evidence.',
      missingEvidence: ['sandbox_result', 'validation_result', 'before_after_metric'],
    };
  }

  const missingEvidence: string[] = [];

  if (!hasPassingSandbox(input.sandboxResult)) {
    missingEvidence.push('sandbox_result');
  }
  if (!hasPassingValidation(input.validationResult)) {
    missingEvidence.push('validation_result');
  }
  if (!hasMaterialMetric(input.beforeAfterMetric)) {
    missingEvidence.push('before_after_metric');
  }

  if (missingEvidence.length > 0) {
    return {
      status: 'rejected',
      acceptedMaterial: false,
      reason: `Executor cycle missing material evidence: ${missingEvidence.join(', ')}`,
      missingEvidence,
    };
  }

  return {
    status: 'accepted_material',
    acceptedMaterial: true,
    reason: 'Executor cycle accepted with sandbox, validation, and before/after metric evidence.',
    missingEvidence: [],
  };
}
