import { describe, expect, it } from 'vitest';

import {
  buildExecutionRealityAuditState,
  classifyExecutionReality,
} from '../execution-reality-audit';
import type { PulseExecutionRealityInput } from '../types.execution-reality-audit';

describe('execution reality audit', () => {
  it('does not allow planned records to count as observed proof', () => {
    const record = classifyExecutionReality({
      id: 'harness-plan',
      sourceArtifact: 'PULSE_HARNESS_EVIDENCE.json',
      status: 'planned',
      evidenceMode: 'blueprint',
      executed: false,
      attempts: 0,
    });

    expect(record.mode).toBe('planned');
    expect(record.countsAsObservedProof).toBe(false);
  });

  it('keeps simulated and inferred records separate from observed proof', () => {
    const records: PulseExecutionRealityInput[] = [
      {
        id: 'simulated-probe',
        sourceArtifact: 'PULSE_RUNTIME_PROBES.json',
        status: 'passed',
        source: 'simulated',
        executed: true,
      },
      {
        id: 'structural-actor',
        sourceArtifact: 'PULSE_ACTOR_EVIDENCE.json',
        status: 'passed',
        truthMode: 'inferred',
        executed: true,
      },
    ];

    const audit = buildExecutionRealityAuditState(records, '2026-04-29T20:00:00.000Z');

    expect(audit.summary.simulated).toBe(1);
    expect(audit.summary.inferred).toBe(1);
    expect(audit.summary.observedProof).toBe(0);
    expect(audit.records.every((record) => !record.countsAsObservedProof)).toBe(true);
  });

  it('counts only terminal execution with execution markers as observed proof', () => {
    const audit = buildExecutionRealityAuditState(
      [
        {
          id: 'legacy-pass-no-attempt',
          sourceArtifact: 'PULSE_HARNESS_EVIDENCE.json',
          status: 'passed',
          attempts: 0,
          executionTimeMs: 0,
        },
        {
          id: 'real-harness-run',
          sourceArtifact: 'PULSE_HARNESS_EVIDENCE.json',
          status: 'passed',
          attempts: 1,
          executionTimeMs: 42,
          startedAt: '2026-04-29T20:00:00.000Z',
          finishedAt: '2026-04-29T20:00:00.042Z',
        },
      ],
      '2026-04-29T20:00:01.000Z',
    );

    expect(audit.summary.totalRecords).toBe(2);
    expect(audit.summary.planned).toBe(1);
    expect(audit.summary.observed).toBe(1);
    expect(audit.summary.observedProof).toBe(1);
    expect(audit.records.find((record) => record.id === 'legacy-pass-no-attempt')?.mode).toBe(
      'planned',
    );
  });
});
