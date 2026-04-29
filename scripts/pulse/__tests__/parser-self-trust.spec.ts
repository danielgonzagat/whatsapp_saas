import { describe, expect, it } from 'vitest';

import { evaluatePulseSelfTrustGate } from '../cert-gate-evaluators';
import type { PulseExecutionTrace, PulseParserInventory } from '../types';

function makeInventory(
  unavailableChecks: PulseParserInventory['unavailableChecks'],
): PulseParserInventory {
  return {
    contracts: [],
    discoveredChecks: ['opaque-load-check', 'opaque-runtime-check'],
    loadedChecks: [
      {
        name: 'opaque-runtime-check',
        file: 'scripts/pulse/parsers/opaque-runtime-check.ts',
        fn: () => [],
      },
    ],
    unavailableChecks,
    helperFilesSkipped: [],
  };
}

function makeTrace(phases: PulseExecutionTrace['phases']): PulseExecutionTrace {
  return {
    runId: 'test-run',
    generatedAt: '2026-04-29T00:00:00.000Z',
    updatedAt: '2026-04-29T00:00:00.000Z',
    phases,
    summary: 'test trace',
    artifactPaths: ['PULSE_EXECUTION_TRACE.json'],
  };
}

describe('parser self-trust diagnostics', () => {
  it('passes when current trace proves a previously unavailable parser executed successfully', () => {
    const result = evaluatePulseSelfTrustGate(
      makeInventory([
        {
          name: 'opaque-load-check',
          file: 'scripts/pulse/parsers/opaque-load-check.ts',
          reason: 'stale load failure from an older artifact',
        },
      ]),
      undefined,
      undefined,
      null,
      makeTrace([
        {
          phase: 'parser:opaque-load-check',
          phaseStatus: 'passed',
          startedAt: '2026-04-29T00:00:00.000Z',
          finishedAt: '2026-04-29T00:00:00.000Z',
        },
      ]),
    );

    expect(result.status).toBe('pass');
    expect(result.reason).not.toContain('stale load failure from an older artifact');
  });

  it('reports current unavailable parser names and reasons instead of an opaque count', () => {
    const result = evaluatePulseSelfTrustGate(
      makeInventory([
        {
          name: 'opaque-load-check',
          file: 'scripts/pulse/parsers/opaque-load-check.ts',
          reason: 'Cannot find module "./opaque-dependency"',
        },
      ]),
      undefined,
      undefined,
      null,
      makeTrace([]),
    );

    expect(result.status).toBe('fail');
    expect(result.reason).toContain('opaque-load-check [load_unavailable]');
    expect(result.reason).toContain('Cannot find module "./opaque-dependency"');
    expect(result.reason).not.toContain('1 check(s) could not load');
  });

  it('prefers live parser execution failures and ignores stale unavailable entries for parsers that passed in trace', () => {
    const result = evaluatePulseSelfTrustGate(
      makeInventory([
        {
          name: 'opaque-load-check',
          file: 'scripts/pulse/parsers/opaque-load-check.ts',
          reason: 'stale load failure from an older artifact',
        },
      ]),
      undefined,
      undefined,
      null,
      makeTrace([
        {
          phase: 'parser:opaque-load-check',
          phaseStatus: 'passed',
          startedAt: '2026-04-29T00:00:00.000Z',
          finishedAt: '2026-04-29T00:00:00.000Z',
        },
        {
          phase: 'parser:opaque-runtime-check',
          phaseStatus: 'failed',
          startedAt: '2026-04-29T00:00:00.000Z',
          finishedAt: '2026-04-29T00:00:00.000Z',
          errorSummary: 'parser=opaque-runtime-check | result=boom',
        },
      ]),
    );

    expect(result.status).toBe('fail');
    expect(result.reason).not.toContain('stale load failure from an older artifact');
    expect(result.reason).toContain('opaque-runtime-check [execution_failed]');
    expect(result.reason).toContain('parser=opaque-runtime-check | result=boom');
  });
});
