import { describe, expect, it } from 'vitest';

import {
  evaluateExecutorCycleMateriality,
  type BeforeAfterMetric,
  type ExecutorValidationResult,
  type SandboxExecutionResult,
} from '../autonomous-executor-policy';

const passingSandbox: SandboxExecutionResult = {
  executed: true,
  isolatedWorktree: true,
  workspacePath: '/tmp/pulse-sandbox',
  exitCode: 0,
  summary: 'sandbox command passed',
};

const passingValidation: ExecutorValidationResult = {
  executed: true,
  passed: true,
  commands: [{ command: 'npx vitest run scripts/pulse/__tests__/target.spec.ts', exitCode: 0 }],
};

const improvedMetric: BeforeAfterMetric = {
  name: 'pulseScore',
  before: 77,
  after: 78,
  improved: true,
};

describe('autonomous executor materiality policy', () => {
  it('does not accept planner daemon cycles as material evidence', () => {
    const decision = evaluateExecutorCycleMateriality({
      daemonMode: 'planner',
      sandboxResult: passingSandbox,
      validationResult: passingValidation,
      beforeAfterMetric: improvedMetric,
    });

    expect(decision.status).toBe('planned_only');
    expect(decision.acceptedMaterial).toBe(false);
    expect(decision.missingEvidence).toEqual([
      'sandbox_result',
      'validation_result',
      'before_after_metric',
    ]);
  });

  it('rejects executor cycles without a passing sandbox result', () => {
    const decision = evaluateExecutorCycleMateriality({
      daemonMode: 'executor',
      sandboxResult: { ...passingSandbox, isolatedWorktree: false },
      validationResult: passingValidation,
      beforeAfterMetric: improvedMetric,
    });

    expect(decision.status).toBe('rejected');
    expect(decision.acceptedMaterial).toBe(false);
    expect(decision.missingEvidence).toContain('sandbox_result');
  });

  it('rejects executor cycles without passing validation evidence', () => {
    const decision = evaluateExecutorCycleMateriality({
      daemonMode: 'executor',
      sandboxResult: passingSandbox,
      validationResult: { ...passingValidation, commands: [] },
      beforeAfterMetric: improvedMetric,
    });

    expect(decision.status).toBe('rejected');
    expect(decision.missingEvidence).toEqual(['validation_result']);
  });

  it('rejects executor cycles without a material before/after metric', () => {
    const decision = evaluateExecutorCycleMateriality({
      daemonMode: 'executor',
      sandboxResult: passingSandbox,
      validationResult: passingValidation,
      beforeAfterMetric: { ...improvedMetric, after: improvedMetric.before },
    });

    expect(decision.status).toBe('rejected');
    expect(decision.missingEvidence).toEqual(['before_after_metric']);
  });

  it('accepts executor cycles only when sandbox, validation, and metric evidence all pass', () => {
    const decision = evaluateExecutorCycleMateriality({
      daemonMode: 'executor',
      sandboxResult: passingSandbox,
      validationResult: passingValidation,
      beforeAfterMetric: improvedMetric,
    });

    expect(decision.status).toBe('accepted_material');
    expect(decision.acceptedMaterial).toBe(true);
    expect(decision.missingEvidence).toEqual([]);
  });
});
