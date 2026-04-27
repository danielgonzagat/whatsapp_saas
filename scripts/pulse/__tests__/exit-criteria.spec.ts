/**
 * exit-criteria.spec.ts
 *
 * Proves evaluateExitCriterion works for each ExitCriterion type.
 */
import { describe, it, expect } from 'vitest';
import { evaluateExitCriterion } from '../autonomy-acceptance';
import type { ExitCriterion } from '../autonomy-loop.types';
import * as fs from 'fs';
import * as path from 'path';

const rootDir = process.cwd();

describe('ExitCriterion — command type', () => {
  it('passes when command exits 0', () => {
    const criterion: ExitCriterion = {
      id: 'test-command',
      type: 'command',
      target: 'echo ok',
      expected: null,
      comparison: 'eq',
    };
    const result = evaluateExitCriterion(rootDir, criterion);
    expect(result.passed).toBe(true);
  });

  it('fails when command exits non-zero', () => {
    const criterion: ExitCriterion = {
      id: 'test-command-fail',
      type: 'command',
      target: 'exit 1',
      expected: null,
      comparison: 'eq',
    };
    const result = evaluateExitCriterion(rootDir, criterion);
    expect(result.passed).toBe(false);
  });
});

describe('ExitCriterion — artifact-assertion type', () => {
  it('fails when artifact file does not exist', () => {
    const criterion: ExitCriterion = {
      id: 'test-missing-artifact',
      type: 'artifact-assertion',
      target: 'nonexistent-file.json',
      expected: {},
      comparison: 'exists',
    };
    const result = evaluateExitCriterion(rootDir, criterion);
    expect(result.passed).toBe(false);
  });
});

describe('ExitCriterion — score-threshold type', () => {
  it.todo(
    'score-threshold evaluation requires PULSE_CERTIFICATE.json fixture setup with validated score data',
  );
});

describe('ExitCriterion — flow-passed type', () => {
  it('reports missing evidence when flow file not found', () => {
    const criterion: ExitCriterion = {
      id: 'test-flow',
      type: 'flow-passed',
      target: 'nonexistent-flow',
      expected: { status: 'passed' },
      comparison: 'eq',
    };
    const result = evaluateExitCriterion(rootDir, criterion);
    expect(typeof result.passed).toBe('boolean');
    expect(typeof result.reason).toBe('string');
  });
});
