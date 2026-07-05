import { describe, it, expect } from 'vitest';
import { buildFounderBlock } from './founder.js';

describe('founder', () => {
  describe('buildFounderBlock', () => {
    it('returns structurally-validated for TypeScript', () => {
      const block = buildFounderBlock({
        file: 'src/index.ts',
        operator: 'atomic_replace_text',
        language: 'ts',
        syntaxBefore: 0,
        syntaxAfter: 0,
        changedChars: 5,
        expansionFactor: 2,
      });
      expect(block.promiseClass).toBe('structurally-validated');
      expect(block.zeroCodeTrust).toBe(60);
    });

    it('returns structurally-validated for JSON', () => {
      const block = buildFounderBlock({
        file: 'package.json',
        operator: 'atomic_replace_text',
        language: 'json',
        syntaxBefore: 0,
        syntaxAfter: 0,
        changedChars: 3,
        expansionFactor: 1,
      });
      expect(block.promiseClass).toBe('structurally-validated');
      expect(block.zeroCodeTrust).toBe(60);
    });

    it('returns balance-validated for structural languages', () => {
      const block = buildFounderBlock({
        file: 'test.py',
        operator: 'atomic_replace_text',
        language: 'structural',
        syntaxBefore: 0,
        syntaxAfter: 0,
        changedChars: 10,
        expansionFactor: 1,
      });
      expect(block.promiseClass).toBe('balance-validated');
      expect(block.zeroCodeTrust).toBe(50);
    });

    it('returns unvalidated-text when errors regress', () => {
      const block = buildFounderBlock({
        file: 'src/index.ts',
        operator: 'atomic_replace_text',
        language: 'ts',
        syntaxBefore: 0,
        syntaxAfter: 1,
        changedChars: 5,
        expansionFactor: 2,
      });
      expect(block.promiseClass).toBe('unvalidated-text');
      expect(block.zeroCodeTrust).toBe(30);
    });

    it('always includes trustCeilingReason', () => {
      const block = buildFounderBlock({
        file: 'x.ts',
        operator: 'op',
        language: 'ts',
        syntaxBefore: 0,
        syntaxAfter: 0,
        changedChars: 1,
        expansionFactor: 1,
      });
      expect(block.trustCeilingReason).toContain('ceiling');
    });

    it('includes whatChanged and notProven', () => {
      const block = buildFounderBlock({
        file: 'x.ts',
        operator: 'atomic_replace_text',
        language: 'ts',
        syntaxBefore: 0,
        syntaxAfter: 0,
        changedChars: 5,
        expansionFactor: 2,
      });
      expect(block.whatChanged).toContain('atomic_replace_text');
      expect(block.notProven).toContain('NOT proven');
    });
  });
});
