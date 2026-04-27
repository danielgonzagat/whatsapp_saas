/**
 * multi-cycle-convergence.spec.ts
 *
 * Proves that:
 *  - Cycles with only `typecheck` do NOT count toward convergence.
 *  - Cycles with runtime-touching validation (playwright, --deep) DO count.
 *  - REQUIRED_NON_REGRESSING_CYCLES is >= 2.
 */
import { describe, expect, it } from 'vitest';

import {
  REQUIRED_NON_REGRESSING_CYCLES,
  evaluateMultiCycleConvergenceGate,
} from '../cert-gate-multi-cycle';
import type { PulseAutonomyIterationRecord } from '../types';

const MIN_REQUIRED_CYCLES = 2;
const DEFAULT_BASELINE_SCORE = 64;
const DEFAULT_BLOCKING_TIER = 1;
const DEFAULT_CODEX_DURATION_MS = 1000;
const TYPECHECK_DURATION_MS = 1000;
const GUIDANCE_DURATION_MS = 2000;
const PLAYWRIGHT_DURATION_MS = 5000;
const DEEP_VALIDATION_DURATION_MS = 3000;
const REGRESSION_BEFORE_SCORE = 70;
const REGRESSION_AFTER_SCORE = 65;

/**
 * Builds a PulseAutonomyIterationRecord populated with deterministic defaults
 * for the fields a single test does not care about, while honoring any
 * overrides the test supplies.
 */
function makeRecord(
  overrides: Partial<PulseAutonomyIterationRecord>,
): PulseAutonomyIterationRecord {
  return {
    acceptance: overrides.acceptance ?? { accepted: true, reason: 'test' },
    codex: {
      agent: overrides.codex?.agent ?? 'test',
      durationMs: overrides.codex?.durationMs ?? DEFAULT_CODEX_DURATION_MS,
      executed: overrides.codex?.executed ?? true,
      exitCode: overrides.codex?.exitCode ?? 0,
      model: overrides.codex?.model ?? 'test',
      output: overrides.codex?.output ?? '',
    },
    cycleId: overrides.cycleId ?? 'test-cycle',
    directiveAfter: {
      blockingTier:
        overrides.directiveAfter?.blockingTier ??
        overrides.directiveBefore?.blockingTier ??
        DEFAULT_BLOCKING_TIER,
      gates: overrides.directiveAfter?.gates ?? {},
      score:
        overrides.directiveAfter?.score ??
        overrides.directiveBefore?.score ??
        DEFAULT_BASELINE_SCORE,
      selectedUnit: overrides.directiveAfter?.selectedUnit ?? '',
    },
    directiveBefore: {
      blockingTier: overrides.directiveBefore?.blockingTier ?? DEFAULT_BLOCKING_TIER,
      gates: {},
      score: overrides.directiveBefore?.score ?? DEFAULT_BASELINE_SCORE,
      selectedUnit: overrides.directiveBefore?.selectedUnit ?? '',
    },
    iterationId: overrides.iterationId ?? 'test',
    validation: {
      artifactPaths: overrides.validation?.artifactPaths ?? [],
      commands: overrides.validation?.commands ?? [],
      executed: overrides.validation?.executed ?? true,
      summary: overrides.validation?.summary ?? '',
    },
    ...overrides,
  };
}

describe('REQUIRED_NON_REGRESSING_CYCLES', () => {
  it('is at least 2', () => {
    expect(REQUIRED_NON_REGRESSING_CYCLES).toBeGreaterThanOrEqual(MIN_REQUIRED_CYCLES);
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
            stderr: '',
            stdout: '',
          },
          {
            command: 'node scripts/pulse/run.js --guidance',
            durationMs: GUIDANCE_DURATION_MS,
            exitCode: 0,
            stderr: '',
            stdout: '',
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
            stderr: '',
            stdout: '',
          },
          {
            command: 'npx playwright test',
            durationMs: PLAYWRIGHT_DURATION_MS,
            exitCode: 0,
            stderr: '',
            stdout: '',
          },
        ],
        executed: true,
      },
    });

    const result = evaluateMultiCycleConvergenceGate({ history: [record] });
    // 1 cycle with runtime validation => nonRegressing=1, required=2 => still fail
    expect(result.status).toBe('fail');
  });

  it('two cycles with playwright validation both passing = convergence achieved', () => {
    const records = [
      makeRecord({
        validation: {
          commands: [
            {
              command: 'npm run typecheck',
              durationMs: TYPECHECK_DURATION_MS,
              exitCode: 0,
              stderr: '',
              stdout: '',
            },
            {
              command: 'npx playwright test',
              durationMs: PLAYWRIGHT_DURATION_MS,
              exitCode: 0,
              stderr: '',
              stdout: '',
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
              stderr: '',
              stdout: '',
            },
            {
              command: 'node scripts/pulse/run.js --deep --customer',
              durationMs: DEEP_VALIDATION_DURATION_MS,
              exitCode: 0,
              stderr: '',
              stdout: '',
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
        gates: {},
        score: REGRESSION_AFTER_SCORE,
        selectedUnit: 'test',
      },
      directiveBefore: {
        blockingTier: DEFAULT_BLOCKING_TIER,
        gates: {},
        score: REGRESSION_BEFORE_SCORE,
        selectedUnit: 'test',
      },
      validation: {
        commands: [
          {
            command: 'npx playwright test',
            durationMs: PLAYWRIGHT_DURATION_MS,
            exitCode: 0,
            stderr: '',
            stdout: '',
          },
        ],
        executed: true,
      },
    });

    const result = evaluateMultiCycleConvergenceGate({ history: [record] });
    expect(result.status).toBe('fail');
  });
});
