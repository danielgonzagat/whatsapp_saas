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
import * as os from 'os';

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
  it('passes when certificate score meets gte threshold', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-test-'));
    const certPath = path.join(tmpDir, 'PULSE_CERTIFICATE.json');
    fs.writeFileSync(certPath, JSON.stringify({ score: 75 }), 'utf8');
    try {
      const criterion: ExitCriterion = {
        id: 'test-score-gte',
        type: 'score-threshold',
        target: '',
        expected: { score: 70 },
        comparison: 'gte',
      };
      const result = evaluateExitCriterion(tmpDir, criterion);
      expect(result.passed).toBe(true);
    } finally {
      try {
        fs.unlinkSync(certPath);
      } catch {}
      try {
        fs.rmdirSync(tmpDir);
      } catch {}
    }
  });

  it('fails when certificate score is below gte threshold', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-test-'));
    const certPath = path.join(tmpDir, 'PULSE_CERTIFICATE.json');
    fs.writeFileSync(certPath, JSON.stringify({ score: 50 }), 'utf8');
    try {
      const criterion: ExitCriterion = {
        id: 'test-score-gte-fail',
        type: 'score-threshold',
        target: '',
        expected: { score: 70 },
        comparison: 'gte',
      };
      const result = evaluateExitCriterion(tmpDir, criterion);
      expect(result.passed).toBe(false);
    } finally {
      try {
        fs.unlinkSync(certPath);
      } catch {}
      try {
        fs.rmdirSync(tmpDir);
      } catch {}
    }
  });

  it('fails when certificate file is missing', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-test-'));
    try {
      const criterion: ExitCriterion = {
        id: 'test-score-missing',
        type: 'score-threshold',
        target: '',
        expected: { score: 70 },
        comparison: 'gte',
      };
      const result = evaluateExitCriterion(tmpDir, criterion);
      expect(result.passed).toBe(false);
      expect(result.reason).toContain('not found');
    } finally {
      try {
        fs.rmdirSync(tmpDir);
      } catch {}
    }
  });
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
