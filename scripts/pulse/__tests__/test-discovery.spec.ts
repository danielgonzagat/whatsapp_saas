/**
 * test-discovery.spec.ts
 *
 * Proves findTestsForChangedFiles discovers related specs correctly.
 */
import { describe, it, expect } from 'vitest';
import { findTestsForChangedFiles } from '../autonomy-loop.test-discovery';

describe('findTestsForChangedFiles', () => {
  const rootDir = process.cwd();

  it('discovers .spec.ts next to the source file', () => {
    // split.controller.ts has split.controller.spec.ts next to it
    const changed = ['backend/src/payments/split/split.controller.ts'];
    const tests = findTestsForChangedFiles(rootDir, changed);
    const specPaths = tests.filter((t) => t.includes('.spec.'));
    expect(specPaths.length).toBeGreaterThan(0);
  });

  it('returns empty array when no related spec exists', () => {
    const changed = ['scripts/pulse/scope-state.ts']; // probably no .spec next to it
    const tests = findTestsForChangedFiles(rootDir, changed);
    expect(tests).toEqual([]);
  });

  it('skips files that are themselves spec/test files', () => {
    const changed = ['backend/src/checkout/checkout-social-lead.service.spec.ts'];
    const tests = findTestsForChangedFiles(rootDir, changed);
    expect(tests).toEqual([]);
  });

  it('handles empty input', () => {
    const tests = findTestsForChangedFiles(rootDir, []);
    expect(tests).toEqual([]);
  });
});
