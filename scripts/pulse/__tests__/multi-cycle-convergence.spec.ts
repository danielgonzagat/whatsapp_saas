/**
 * multi-cycle-convergence.spec.ts
 *
 * Proves that:
 *  - Cycles with only `typecheck` do NOT count toward convergence.
 *  - Cycles with runtime-touching validation (playwright, --deep) DO count.
 *  - REQUIRED_NON_REGRESSING_CYCLES is 3.
 */
import { describe, expect, it } from 'vitest';

import {
  REQUIRED_NON_REGRESSING_CYCLES,
  evaluateMultiCycleConvergenceGate,
} from '../cert-gate-multi-cycle';
import type { PulseAutonomyIterationRecord, PulseAutonomyValidationCommandResult } from '../types';

const REQUIRED_CYCLES = 3;
const DEFAULT_BASELINE_SCORE = 64;
const DEFAULT_BLOCKING_TIER = 1;
const TYPECHECK_DURATION_MS = 1000;
const GUIDANCE_DURATION_MS = 2000;
const PLAYWRIGHT_DURATION_MS = 5000;
const DEEP_VALIDATION_DURATION_MS = 3000;
const REGRESSION_BEFORE_SCORE = 70;
const REGRESSION_AFTER_SCORE = 65;
const MATRIX_OBSERVED_PASS_BASELINE = 12;
const MATRIX_CRITICAL_UNOBSERVED_BASELINE = 4;

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

/**
 * Builds a PulseAutonomyIterationRecord populated with deterministic defaults
 * for the fields a single test does not care about, while honoring any
 * overrides the test supplies.
 */
function makeRecord(overrides: TestRecordOverrides): PulseAutonomyIterationRecord {
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

describe('REQUIRED_NON_REGRESSING_CYCLES', () => {
  it('requires 3 real non-regressing cycles', () => {
    expect(REQUIRED_NON_REGRESSING_CYCLES).toBe(REQUIRED_CYCLES);
  });
});

describe('typecheck-only cycle does NOT count toward convergence', () => {
  it('evaluateMultiCycleConvergenceGate returns fail when only typecheck validation ran', () => {
    const record = makeRecord({
      validation: {
        commands: [
          {
            command: 'npm run typecheck',
            durationMs: TYPECHECK_DURATION_MS,
            exitCode: 0,
            summary: '',
          },
          {
            command: 'node scripts/pulse/run.js --guidance',
            durationMs: GUIDANCE_DURATION_MS,
            exitCode: 0,
            summary: '',
          },
        ],
        executed: true,
      },
    });

    const result = evaluateMultiCycleConvergenceGate({ history: [record] });
    expect(result.status).toBe('fail');
  });
});

describe('cycle with runtime validation DOES count toward convergence', () => {
  it('playwright test in validation commands counts', () => {
    const record = makeRecord({
      validation: {
        commands: [
          {
            command: 'npm run typecheck',
            durationMs: TYPECHECK_DURATION_MS,
            exitCode: 0,
            summary: '',
          },
          {
            command: 'npx playwright test',
            durationMs: PLAYWRIGHT_DURATION_MS,
            exitCode: 0,
            summary: '',
          },
        ],
        executed: true,
      },
    });

    const result = evaluateMultiCycleConvergenceGate({ history: [record] });
    // 1 cycle with runtime validation => nonRegressing=1, required=3 => still fail
    expect(result.status).toBe('fail');
  });

  it('three cycles with runtime validation passing = convergence achieved', () => {
    const records = [
      makeRecord({
        validation: {
          commands: [
            {
              command: 'npm run typecheck',
              durationMs: TYPECHECK_DURATION_MS,
              exitCode: 0,
              summary: '',
            },
            {
              command: 'npx playwright test',
              durationMs: PLAYWRIGHT_DURATION_MS,
              exitCode: 0,
              summary: '',
            },
          ],
          executed: true,
        },
      }),
      makeRecord({
        validation: {
          commands: [
            {
              command: 'npm run typecheck',
              durationMs: TYPECHECK_DURATION_MS,
              exitCode: 0,
              summary: '',
            },
            {
              command: 'node scripts/pulse/run.js --deep --customer',
              durationMs: DEEP_VALIDATION_DURATION_MS,
              exitCode: 0,
              summary: '',
            },
          ],
          executed: true,
        },
      }),
      makeRecord({
        validation: {
          commands: [
            {
              command: 'node scripts/pulse/run.js --total --certify --json',
              durationMs: DEEP_VALIDATION_DURATION_MS,
              exitCode: 0,
              summary: '',
            },
          ],
          executed: true,
        },
      }),
    ];

    const result = evaluateMultiCycleConvergenceGate({ history: records });
    expect(result.status).toBe('pass');
  });
});

describe('regression detection in multi-cycle', () => {
  it('cycle where score regresses does NOT count', () => {
    const record = makeRecord({
      directiveAfter: {
        blockingTier: DEFAULT_BLOCKING_TIER,
        score: REGRESSION_AFTER_SCORE,
        visionGap: 'test',
      },
      directiveBefore: {
        blockingTier: DEFAULT_BLOCKING_TIER,
        score: REGRESSION_BEFORE_SCORE,
        visionGap: 'test',
      },
      validation: {
        commands: [
          {
            command: 'npx playwright test',
            durationMs: PLAYWRIGHT_DURATION_MS,
            exitCode: 0,
            summary: '',
          },
        ],
        executed: true,
      },
    });

    const result = evaluateMultiCycleConvergenceGate({ history: [record] });
    expect(result.status).toBe('fail');
  });

  it('cycle where execution matrix worsens does NOT count when snapshots are present', () => {
    const record = Object.assign(
      makeRecord({
        validation: {
          commands: [
            {
              command: 'node scripts/pulse/run.js --deep --customer',
              durationMs: DEEP_VALIDATION_DURATION_MS,
              exitCode: 0,
              summary: '',
            },
          ],
          executed: true,
        },
      }),
      {
        executionMatrixSummaryBefore: {
          observedPass: MATRIX_OBSERVED_PASS_BASELINE,
          criticalUnobservedPaths: MATRIX_CRITICAL_UNOBSERVED_BASELINE,
          unknownPaths: 0,
          impreciseBreakpoints: 0,
        },
        executionMatrixSummaryAfter: {
          observedPass: MATRIX_OBSERVED_PASS_BASELINE - 1,
          criticalUnobservedPaths: MATRIX_CRITICAL_UNOBSERVED_BASELINE + 1,
          unknownPaths: 0,
          impreciseBreakpoints: 0,
        },
      },
    );

    const result = evaluateMultiCycleConvergenceGate({ history: [record] });
    expect(result.status).toBe('fail');
    expect(result.reason).toContain('regressedExecutionMatrix=1');
  });
});
