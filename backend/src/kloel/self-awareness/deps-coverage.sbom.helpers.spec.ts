import { filterDeps, type DepResult } from './deps-coverage.sbom.helpers';

describe('deps-coverage SBOM helpers (K57 proof)', () => {
  const seed: DepResult[] = [
    { name: 'react', version: '18.2.0', type: 'library' },
    { name: 'next', version: '14.0.0', type: 'framework' },
    { name: 'react-dom', version: '18.2.0', type: 'library' },
  ];

  describe('filterDeps', () => {
    it('returns all deps when pattern is undefined', () => {
      const out = filterDeps(seed, undefined);
      expect(out.success).toBe(true);
      expect(out.deps).toHaveLength(3);
      expect(out.count).toBe(3);
    });

    it('filters by substring match', () => {
      const out = filterDeps(seed, 'react');
      expect(out.deps).toHaveLength(2);
      expect(out.deps?.map((d) => d.name)).toEqual(['react', 'react-dom']);
    });

    it('returns empty when no match', () => {
      const out = filterDeps(seed, 'nonexistent');
      expect(out.deps).toHaveLength(0);
      expect(out.count).toBe(0);
    });
  });
});
