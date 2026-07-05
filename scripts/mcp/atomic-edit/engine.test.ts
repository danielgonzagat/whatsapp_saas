import { describe, it, expect } from 'vitest';
import { validate, replaceText, applyEdits, posToOffset, offsetToLine } from './engine.js';

describe('engine', () => {
  describe('validate', () => {
    it('accepts valid TypeScript', () => {
      const result = validate('test.ts', 'const x = 1;', 'const x: number = 1;');
      expect(result.ok).toBe(true);
      expect(result.after).toBe(0);
    });

    it('rejects syntactically broken TypeScript', () => {
      const result = validate('test.ts', 'const x = 1;', 'const x: number = ;;;');
      expect(result.ok).toBe(false);
    });

    it('accepts valid JSON', () => {
      const result = validate('test.json', '{"a":1}', '{"a":1,"b":2}');
      expect(result.ok).toBe(true);
      expect(result.after).toBe(0);
    });

    it('rejects broken JSON', () => {
      const result = validate('test.json', '{"a":1}', '{broken}');
      expect(result.ok).toBe(false);
    });

    it('rejects when error count increases', () => {
      const before = 'const x = 1;\nconst y: number = 1;';
      const after = 'const x = 1;\nconst y: number = 1;\nconst z: number = ;;;';
      const result = validate('test.ts', before, after);
      expect(result.ok).toBe(false);
    });

    it('accepts when error count stays same', () => {
      const result = validate('test.ts', 'const x = 1;', 'const x = 2;');
      expect(result.ok).toBe(true);
    });
  });

  describe('replaceText', () => {
    it('replaces a single occurrence', () => {
      const result = replaceText('test.ts', 'hello beautiful world', 'ello', 'i');
      expect(result.validation.ok).toBe(true);
      expect(result.newText).toBe('hi beautiful world');
    });

    it('rejects duplicate occurrence by default', () => {
      expect(() => replaceText('test.ts', 'const a = 1;\nconst a = 1;', 'a', 'b'))
        .toThrow('ambiguous');
    });

    it('accepts with explicit occurrence', () => {
      const result = replaceText('test.ts', 'const a = 1;\nconst a = 1;', 'a', 'b', 1);
      expect(result.validation.ok).toBe(true);
      expect(result.newText).toBe('const b = 1;\nconst a = 1;');
    });

    it('throws when oldText not found', () => {
      expect(() => replaceText('test.ts', 'hello world', 'xyz', 'abc'))
        .toThrow('not found');
    });
  });

  describe('applyEdits', () => {
    it('applies a single edit', () => {
      const original = 'const a = 1;\nconst b = 2;\n';
      const result = applyEdits('test.ts', original, [
        { start: { line: 2, column: 11 }, end: { line: 2, column: 12 }, newText: '3' },
      ]);
      expect(result.validation.ok).toBe(true);
      expect(result.newText).toBe('const a = 1;\nconst b = 3;\n');
    });

    it('applies multiple non-overlapping edits', () => {
      const original = 'const a = 1;\nconst b = 2;\nconst c = 3;';
      const result = applyEdits('test.ts', original, [
        { start: { line: 1, column: 11 }, end: { line: 1, column: 12 }, newText: '10' },
        { start: { line: 2, column: 11 }, end: { line: 2, column: 12 }, newText: '20' },
      ]);
      expect(result.validation.ok).toBe(true);
      expect(result.newText).toBe('const a = 10;\nconst b = 20;\nconst c = 3;');
    });

    it('rejects overlapping edits', () => {
      const original = 'const ab = 99;\nconst cd = 100;\n';
      expect(() => applyEdits('test.ts', original, [
        { start: { line: 1, column: 7 }, end: { line: 1, column: 9 }, newText: 'xy' },
        { start: { line: 1, column: 8 }, end: { line: 1, column: 10 }, newText: 'zw' },
      ])).toThrow('overlapping');
    });
  });

  describe('posToOffset', () => {
    it('converts line/column to byte offset', () => {
      const text = 'hello\nworld\n';
      expect(posToOffset(text, { line: 1, column: 1 })).toBe(0);
      expect(posToOffset(text, { line: 2, column: 1 })).toBe(6);
    });
  });

  describe('offsetToLine', () => {
    it('converts byte offset to line number', () => {
      const text = 'hello\nworld\n';
      expect(offsetToLine(text, 0)).toBe(1);
      expect(offsetToLine(text, 6)).toBe(2);
    });
  });
});
