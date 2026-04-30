import { describe, expect, it } from 'vitest';

import { evaluateProofReadinessGate } from '../proof-readiness-gate';
import type {
  ProofReadinessEvidenceSummary,
  ProofReadinessTaskSummary,
} from '../proof-readiness-gate';

function task(overrides: Partial<ProofReadinessTaskSummary> = {}): ProofReadinessTaskSummary {
  return {
    taskId: 'path-proof:endpoint:checkout',
    pathId: 'matrix:path:checkout',
    mode: 'endpoint',
    status: 'planned',
    executed: false,
    coverageCountsAsObserved: false,
    autonomousExecutionAllowed: true,
    ...overrides,
  };
}

function observedEvidence(
  overrides: Partial<ProofReadinessEvidenceSummary> = {},
): ProofReadinessEvidenceSummary {
  return {
    id: 'path-proof:endpoint:checkout',
    taskId: 'path-proof:endpoint:checkout',
    pathId: 'matrix:path:checkout',
    sourceArtifact: 'PULSE_HARNESS_EVIDENCE.json',
    status: 'passed',
    evidenceMode: 'observed',
    executed: true,
    attempts: 1,
    startedAt: '2026-04-29T20:00:00.000Z',
    finishedAt: '2026-04-29T20:00:00.042Z',
    ...overrides,
  };
}

describe('proof readiness gate', () => {
  it('blocks production proof advancement when executable planned tasks have no observed evidence', () => {
    const result = evaluateProofReadinessGate({
      tasks: [task()],
      evidence: [
        observedEvidence({
          status: 'planned',
          evidenceMode: 'blueprint',
          executed: false,
          attempts: 0,
          startedAt: null,
          finishedAt: null,
        }),
      ],
    });

    expect(result.canAdvance).toBe(false);
    expect(result.status).toBe('executable_unproved');
    expect(result.summary).toEqual(
      expect.objectContaining({
        executableTasks: 1,
        executableObserved: 0,
        executableUnproved: 1,
        blockedHumanRequired: 0,
        blockedNotExecutable: 0,
        observedEvidence: 0,
        nonObservedEvidence: 1,
      }),
    );
    expect(result.blockers).toEqual([
      {
        taskId: 'path-proof:endpoint:checkout',
        pathId: 'matrix:path:checkout',
        mode: 'endpoint',
        reason: 'executable_without_observed_evidence',
      },
    ]);
  });

  it('allows advancement when each executable task has terminal observed evidence', () => {
    const result = evaluateProofReadinessGate({
      tasks: [
        task(),
        task({
          taskId: 'path-proof:worker:sync',
          pathId: 'matrix:path:sync',
          mode: 'worker',
        }),
      ],
      evidence: [
        observedEvidence(),
        observedEvidence({
          id: 'matrix:path:sync',
          taskId: 'path-proof:worker:sync',
          pathId: 'matrix:path:sync',
          status: 'failed',
        }),
      ],
    });

    expect(result.canAdvance).toBe(true);
    expect(result.status).toBe('ready');
    expect(result.summary).toEqual(
      expect.objectContaining({
        executableTasks: 2,
        executableObserved: 2,
        executableUnproved: 0,
        observedEvidence: 2,
      }),
    );
    expect(result.blockers).toEqual([]);
  });

  it('keeps human-required and not-executable tasks separate from executable proof debt', () => {
    const result = evaluateProofReadinessGate({
      tasks: [
        task({
          taskId: 'path-proof:human:governance',
          pathId: 'matrix:path:governance',
          mode: 'human_required',
          autonomousExecutionAllowed: false,
        }),
        task({
          taskId: 'path-proof:not-executable:inventory',
          pathId: 'matrix:path:inventory',
          mode: 'not_executable',
          autonomousExecutionAllowed: false,
        }),
      ],
      evidence: [],
    });

    expect(result.canAdvance).toBe(false);
    expect(result.status).toBe('blocked');
    expect(result.summary).toEqual(
      expect.objectContaining({
        executableTasks: 0,
        executableObserved: 0,
        executableUnproved: 0,
        blockedHumanRequired: 1,
        blockedNotExecutable: 1,
      }),
    );
    expect(result.blockers.map((blocker) => blocker.reason)).toEqual([
      'human_required',
      'not_executable',
    ]);
  });
});
