import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  PulseExecutionTracer,
  runPhaseWithTrace,
  verifyExecutionTraceAuditTrail,
} from '../execution-trace';
import type { PulseExecutionTrace } from '../types';

async function withTempTrace(run: (tracePath: string) => Promise<void> | void): Promise<void> {
  const rootDir = fs.mkdtempSync(path.join(process.cwd(), '.pulse-execution-trace-test-'));
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

describe('execution trace audit trail', () => {
  it('writes a verifiable hash-chain digest for phase history', async () => {
    await withTempTrace(async (tracePath) => {
      const tracer = new PulseExecutionTracer(process.cwd());

      await runPhaseWithTrace(tracer, 'audit-chain-proof', () => 'ok', {
        metadata: { worker: 9, substitute: true },
      });

      const trace = readTrace(tracePath);
      const auditTrail = (
        trace as PulseExecutionTrace & {
          auditTrail: { eventCount: number; chainHead: string; verified: boolean };
        }
      ).auditTrail;

      expect(trace.phases).toHaveLength(1);
      expect(auditTrail.eventCount).toBe(1);
      expect(auditTrail.chainHead).toMatch(/^[a-f0-9]{64}$/);
      expect(auditTrail.verified).toBe(true);
      expect(verifyExecutionTraceAuditTrail(trace)).toBe(true);
    });
  });

  it('detects mutable phase history after the trace digest was written', () => {
    return withTempTrace((tracePath) => {
      const tracer = new PulseExecutionTracer(process.cwd());
      tracer.startPhase('audit-chain-proof');
      tracer.finishPhase('audit-chain-proof', 'passed');

      const trace = readTrace(tracePath);
      const tampered: PulseExecutionTrace = {
        ...trace,
        phases: trace.phases.map((phase) => ({
          ...phase,
          phaseStatus: 'failed',
          errorSummary: 'rewritten after completion',
        })),
      };

      expect(verifyExecutionTraceAuditTrail(trace)).toBe(true);
      expect(verifyExecutionTraceAuditTrail(tampered)).toBe(false);
    });
  });
});
