import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { evaluatePulseSelfTrustGate } from '../cert-gate-evaluators';
import { checkParserHardcodedFindingAudit } from '../self-trust';
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

  it('fails the certification gate with the execution trace audit checkpoint reason', () => {
    const result = evaluatePulseSelfTrustGate(
      makeInventory([]),
      undefined,
      undefined,
      {
        checks: [
          {
            id: 'execution-trace-audit-trail',
            name: 'Execution Trace Audit Trail',
            pass: false,
            reason: 'Execution trace audit digest does not match current phase history',
          },
        ],
      },
      makeTrace([]),
    );

    expect(result.status).toBe('fail');
    expect(result.reason).toContain('Execution Trace Audit Trail failed');
    expect(result.reason).toContain(
      'Execution trace audit digest does not match current phase history',
    );
  });

  it('accuses parser Break emitters that hardcode final blocker identities', () => {
    const rootDir = fs.mkdtempSync(path.join(process.cwd(), '.pulse-parser-self-trust-'));
    const parsersDir = path.join(rootDir, 'scripts', 'pulse', 'parsers');
    fs.mkdirSync(parsersDir, { recursive: true });
    fs.writeFileSync(
      path.join(parsersDir, 'hardcoded-final-break.ts'),
      [
        'export function check(): unknown[] {',
        '  const breaks = [];',
        "  breaks.push({ type: 'FINAL_STATIC_BREAK', severity: 'high' });",
        '  return breaks;',
        '}',
      ].join('\n'),
    );

    try {
      const check = checkParserHardcodedFindingAudit(parsersDir);
      const result = evaluatePulseSelfTrustGate(
        makeInventory([]),
        undefined,
        undefined,
        { checks: [check] },
        makeTrace([]),
      );

      expect(check.pass).toBe(false);
      expect(check.severity).toBe('critical');
      expect(check.reason).toContain('hardcoded_break_push_type_risk');
      expect(result.status).toBe('fail');
      expect(result.reason).toContain('Parser Hardcoded Finding Audit failed');
      expect(result.reason).toContain('FINAL_STATIC_BREAK');
    } finally {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  });
});
