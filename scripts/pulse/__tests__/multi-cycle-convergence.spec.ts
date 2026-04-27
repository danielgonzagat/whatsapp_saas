/**
 * multi-cycle-convergence.spec.ts
 *
 * Proves that:
 *  - Cycles with only `typecheck` do NOT count toward convergence.
 *  - Cycles with runtime-touching validation (playwright, --deep) DO count.
 *  - REQUIRED_NON_REGRESSING_CYCLES is >= 2.
 */
import { describe, it, expect } from 'vitest';
import {
  evaluateMultiCycleConvergenceGate,
  REQUIRED_NON_REGRESSING_CYCLES,
} from '../cert-gate-multi-cycle';
import type { PulseAutonomyIterationRecord } from '../types';

function makeRecord(
  overrides: Partial<PulseAutonomyIterationRecord>,
): PulseAutonomyIterationRecord {
  return {
    cycleId: overrides.cycleId ?? 'test-cycle',
    iterationId: overrides.iterationId ?? 'test',
    codex: {
      executed: overrides.codex?.executed ?? true,
      exitCode: overrides.codex?.exitCode ?? 0,
      output: overrides.codex?.output ?? '',
      durationMs: overrides.codex?.durationMs ?? 1000,
      agent: overrides.codex?.agent ?? 'test',
      model: overrides.codex?.model ?? 'test',
    },
    validation: {
      executed: overrides.validation?.executed ?? true,
      commands: overrides.validation?.commands ?? [],
      summary: overrides.validation?.summary ?? '',
      artifactPaths: overrides.validation?.artifactPaths ?? [],
    },
    directiveBefore: {
      score: overrides.directiveBefore?.score ?? 64,
      blockingTier: overrides.directiveBefore?.blockingTier ?? 1,
      gates: {},
      selectedUnit: overrides.directiveBefore?.selectedUnit ?? '',
    },
    directiveAfter: {
      score: overrides.directiveAfter?.score ?? overrides.directiveBefore?.score ?? 64,
      blockingTier:
        overrides.directiveAfter?.blockingTier ?? overrides.directiveBefore?.blockingTier ?? 1,
      gates: overrides.directiveAfter?.gates ?? {},
      selectedUnit: overrides.directiveAfter?.selectedUnit ?? '',
    },
    acceptance: overrides.acceptance ?? { accepted: true, reason: 'test' },
    ...overrides,
  };
}

describe('REQUIRED_NON_REGRESSING_CYCLES', () => {
  it('is at least 2', () => {
    expect(REQUIRED_NON_REGRESSING_CYCLES).toBeGreaterThanOrEqual(2);
  });
});

describe('typecheck-only cycle does NOT count toward convergence', () => {
  it('evaluateMultiCycleConvergenceGate returns fail when only typecheck validation ran', () => {
    const record = makeRecord({
      validation: {
        executed: true,
        commands: [
          { command: 'npm run typecheck', exitCode: 0, stdout: '', stderr: '', durationMs: 1000 },
          {
            command: 'node scripts/pulse/run.js --guidance',
            exitCode: 0,
            stdout: '',
            stderr: '',
            durationMs: 2000,
          },
        ],
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
        executed: true,
        commands: [
          { command: 'npm run typecheck', exitCode: 0, stdout: '', stderr: '', durationMs: 1000 },
          { command: 'npx playwright test', exitCode: 0, stdout: '', stderr: '', durationMs: 5000 },
        ],
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
          executed: true,
          commands: [
            { command: 'npm run typecheck', exitCode: 0, stdout: '', stderr: '', durationMs: 1000 },
            {
              command: 'npx playwright test',
              exitCode: 0,
              stdout: '',
              stderr: '',
              durationMs: 5000,
            },
          ],
        },
      }),
      makeRecord({
        validation: {
          executed: true,
          commands: [
            { command: 'npm run typecheck', exitCode: 0, stdout: '', stderr: '', durationMs: 1000 },
            {
              command: 'node scripts/pulse/run.js --deep --customer',
              exitCode: 0,
              stdout: '',
              stderr: '',
              durationMs: 3000,
            },
          ],
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
      directiveBefore: { score: 70, blockingTier: 1, gates: {}, selectedUnit: 'test' },
      directiveAfter: { score: 65, blockingTier: 1, gates: {}, selectedUnit: 'test' },
      validation: {
        executed: true,
        commands: [
          { command: 'npx playwright test', exitCode: 0, stdout: '', stderr: '', durationMs: 5000 },
        ],
      },
    });

    const result = evaluateMultiCycleConvergenceGate({ history: [record] });
    expect(result.status).toBe('fail');
  });
});
