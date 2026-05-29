import { isWorkspace, looksLikeFilePath } from './deps-coverage.helpers';

describe('deps-coverage helpers (K56 proof)', () => {
  describe('isWorkspace', () => {
    it('returns true for canonical workspace names', () => {
      expect(isWorkspace('backend')).toBe(true);
      expect(isWorkspace('frontend')).toBe(true);
      expect(isWorkspace('worker')).toBe(true);
      expect(isWorkspace('e2e')).toBe(true);
      expect(isWorkspace('root')).toBe(true);
    });

    it('returns false for non-workspace strings', () => {
      expect(isWorkspace('random')).toBe(false);
      expect(isWorkspace('')).toBe(false);
      expect(isWorkspace('backend/src/file.ts')).toBe(false);
    });
  });

  describe('looksLikeFilePath', () => {
    it('returns true for paths with separators or known extensions', () => {
      expect(looksLikeFilePath('backend/src/foo.ts')).toBe(true);
      expect(looksLikeFilePath('a/b/c.tsx')).toBe(true);
      expect(looksLikeFilePath('foo.ts')).toBe(true);
    });

    it('returns false for bare names', () => {
      expect(looksLikeFilePath('backend')).toBe(false);
      expect(looksLikeFilePath('')).toBe(false);
    });
  });
});
