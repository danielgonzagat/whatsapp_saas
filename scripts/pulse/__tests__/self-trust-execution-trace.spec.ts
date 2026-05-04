import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { evaluatePulseSelfTrustGate } from '../cert-gate-evaluators';
import { PulseExecutionTracer } from '../execution-trace';
import { checkExecutionTraceAuditTrail } from '../self-trust';
import type { PulseExecutionTrace, PulseParserInventory } from '../types';

async function withTempTrace(run: (tracePath: string) => Promise<void> | void): Promise<void> {
  const rootDir = fs.mkdtempSync(path.join(process.cwd(), '.pulse-self-trust-trace-test-'));
  const previousPath = process.env.PULSE_EXECUTION_TRACE_PATH;
  const tracePath = path.join(rootDir, 'trace.json');

  try {
    process.env.PULSE_EXECUTION_TRACE_PATH = tracePath;
    await run(tracePath);
  } finally {
    if (previousPath === undefined) {
      delete process.env.PULSE_EXECUTION_TRACE_PATH;
    } else {
      process.env.PULSE_EXECUTION_TRACE_PATH = previousPath;
    }
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
}

function readTrace(tracePath: string): PulseExecutionTrace {
  return JSON.parse(fs.readFileSync(tracePath, 'utf8')) as PulseExecutionTrace;
}

function tamperTrace(trace: PulseExecutionTrace): PulseExecutionTrace {
  return {
    ...trace,
    phases: trace.phases.map((phase) => ({
      ...phase,
      phaseStatus: 'failed',
      errorSummary: 'phase history changed after audit digest was written',
    })),
  };
}

function makeInventory(): PulseParserInventory {
  return {
    contracts: [],
    discoveredChecks: [],
    loadedChecks: [],
    unavailableChecks: [],
    helperFilesSkipped: [],
  };
}

describe('self-trust execution trace audit trail', () => {
  it('passes only when the active execution trace audit trail is intact', async () => {
    await withTempTrace((tracePath) => {
      const tracer = new PulseExecutionTracer(process.cwd());
      tracer.startPhase('self-trust-trace-proof');
      tracer.finishPhase('self-trust-trace-proof', 'passed');

      const trace = readTrace(tracePath);
      const result = checkExecutionTraceAuditTrail({});
      const tamperedResult = checkExecutionTraceAuditTrail({ executionTrace: tamperTrace(trace) });

      expect(result.pass).toBe(true);
      expect(result.id).toBe('execution-trace-audit-trail');
      expect(tamperedResult.pass).toBe(false);
      expect(tamperedResult.severity).toBe('critical');
      expect(tamperedResult.reason).toContain('does not match current phase history');
    });
  });

  it('fails the self-trust gate when the focused execution trace checkpoint fails', async () => {
    await withTempTrace((tracePath) => {
      const tracer = new PulseExecutionTracer(process.cwd());
      tracer.startPhase('self-trust-trace-proof');
      tracer.finishPhase('self-trust-trace-proof', 'passed');

      const traceCheck = checkExecutionTraceAuditTrail({
        executionTrace: tamperTrace(readTrace(tracePath)),
      });
      const gate = evaluatePulseSelfTrustGate(
        makeInventory(),
        undefined,
        undefined,
        { checks: [traceCheck] },
        readTrace(tracePath),
      );

      expect(traceCheck.pass).toBe(false);
      expect(gate.status).toBe('fail');
      expect(gate.reason).toContain('Execution Trace Audit Trail failed');
    });
  });
});
