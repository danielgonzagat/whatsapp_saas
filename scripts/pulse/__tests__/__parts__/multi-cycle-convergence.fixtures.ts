import type {
  PulseAutonomyIterationRecord,
  PulseAutonomyValidationCommandResult,
} from '../../types';

export const REQUIRED_CYCLES = 3;
export const DEFAULT_BASELINE_SCORE = 64;
export const DEFAULT_BLOCKING_TIER = 1;
export const TYPECHECK_DURATION_MS = 1000;
export const GUIDANCE_DURATION_MS = 2000;
export const PLAYWRIGHT_DURATION_MS = 5000;
export const DEEP_VALIDATION_DURATION_MS = 3000;
export const REGRESSION_BEFORE_SCORE = 70;
export const REGRESSION_AFTER_SCORE = 65;
export const MATRIX_OBSERVED_PASS_BASELINE = 12;
export const MATRIX_CRITICAL_UNOBSERVED_BASELINE = 4;

type TestDirectiveSnapshot = PulseAutonomyIterationRecord['directiveBefore'];
type TestRecordOverrides = Partial<
  Omit<PulseAutonomyIterationRecord, 'codex' | 'directiveBefore' | 'directiveAfter' | 'validation'>
> & {
  codex?: Partial<PulseAutonomyIterationRecord['codex']>;
  directiveBefore?: Partial<TestDirectiveSnapshot>;
  directiveAfter?: Partial<TestDirectiveSnapshot>;
  validation?: {
    executed?: boolean;
    commands?: PulseAutonomyValidationCommandResult[];
  };
};

export function makeRecord(overrides: TestRecordOverrides): PulseAutonomyIterationRecord {
  return {
    codex: {
      command: overrides.codex?.command ?? 'codex exec test',
      executed: overrides.codex?.executed ?? true,
      exitCode: overrides.codex?.exitCode ?? 0,
      finalMessage: overrides.codex?.finalMessage ?? 'test',
    },
    directiveDigestAfter: overrides.directiveDigestAfter ?? 'after',
    directiveDigestBefore: overrides.directiveDigestBefore ?? 'before',
    directiveAfter: {
      blockingTier:
        overrides.directiveAfter?.blockingTier ??
        overrides.directiveBefore?.blockingTier ??
        DEFAULT_BLOCKING_TIER,
      certificationStatus: overrides.directiveAfter?.certificationStatus ?? 'PARTIAL',
      visionGap: overrides.directiveAfter?.visionGap ?? 'test',
      score:
        overrides.directiveAfter?.score ??
        overrides.directiveBefore?.score ??
        DEFAULT_BASELINE_SCORE,
    },
    directiveBefore: {
      blockingTier: overrides.directiveBefore?.blockingTier ?? DEFAULT_BLOCKING_TIER,
      certificationStatus: overrides.directiveBefore?.certificationStatus ?? 'PARTIAL',
      score: overrides.directiveBefore?.score ?? DEFAULT_BASELINE_SCORE,
      visionGap: overrides.directiveBefore?.visionGap ?? 'test',
    },
    finishedAt: overrides.finishedAt ?? '2026-04-28T00:00:01.000Z',
    improved: overrides.improved ?? true,
    iteration: overrides.iteration ?? 1,
    plannerMode: overrides.plannerMode ?? 'deterministic',
    startedAt: overrides.startedAt ?? '2026-04-28T00:00:00.000Z',
    status: overrides.status ?? 'validated',
    strategyMode: overrides.strategyMode ?? null,
    summary: overrides.summary ?? 'test cycle',
    unit: overrides.unit ?? null,
    validation: {
      commands: overrides.validation?.commands ?? [],
      executed: overrides.validation?.executed ?? true,
    },
  };
}
