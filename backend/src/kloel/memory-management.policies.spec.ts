import {
  MEMORY_EXPIRATION_DAYS,
  cutoffDateForCategory,
  findDuplicateMemoryIds,
  findOrphanWorkspaceIds,
  groupMemoriesByKeyPrefix,
  knownMemoryCategories,
  pickStaleSemanticDuplicateIds,
} from './memory-management.policies';

describe('memory-management.policies', () => {
  describe('MEMORY_EXPIRATION_DAYS', () => {
    it('exposes a frozen policy table with a default fallback', () => {
      expect(MEMORY_EXPIRATION_DAYS.default).toBe(180);
      expect(MEMORY_EXPIRATION_DAYS.temporary).toBe(1);
      expect(Object.isFrozen(MEMORY_EXPIRATION_DAYS)).toBe(true);
    });
  });

  describe('knownMemoryCategories', () => {
    it('returns every key except `default`', () => {
      const cats = knownMemoryCategories();
      expect(cats).not.toContain('default');
      expect(cats).toContain('products');
      expect(cats).toContain('leads');
    });

    it('accepts a custom policy', () => {
      expect(knownMemoryCategories({ alpha: 1, beta: 2, default: 3 })).toEqual(['alpha', 'beta']);
    });
  });

  describe('cutoffDateForCategory', () => {
    it('subtracts the configured days from `now`', () => {
      const now = new Date('2026-01-31T00:00:00Z');
      const cutoff = cutoffDateForCategory('temporary', MEMORY_EXPIRATION_DAYS, now);
      const diffDays = Math.round((now.getTime() - cutoff.getTime()) / (1000 * 60 * 60 * 24));
      expect(diffDays).toBe(1);
    });

    it('falls back to default when category is unknown', () => {
      const now = new Date('2026-01-31T00:00:00Z');
      const cutoff = cutoffDateForCategory('unknown_cat', MEMORY_EXPIRATION_DAYS, now);
      const diffDays = Math.round((now.getTime() - cutoff.getTime()) / (1000 * 60 * 60 * 24));
      expect(diffDays).toBe(180);
    });

    it('falls back to 180 when neither category nor default exists', () => {
      const now = new Date('2026-01-31T00:00:00Z');
      const cutoff = cutoffDateForCategory('x', {}, now);
      const diffDays = Math.round((now.getTime() - cutoff.getTime()) / (1000 * 60 * 60 * 24));
      expect(diffDays).toBe(180);
    });
  });

  describe('findDuplicateMemoryIds', () => {
    it('returns IDs that share a key with an earlier entry', () => {
      const ids = findDuplicateMemoryIds([
        { id: 'a', key: 'k1' },
        { id: 'b', key: 'k2' },
        { id: 'c', key: 'k1' }, // dup of a
        { id: 'd', key: 'k2' }, // dup of b
        { id: 'e', key: 'k3' },
      ]);
      expect(ids).toEqual(['c', 'd']);
    });

    it('returns empty for unique input', () => {
      expect(findDuplicateMemoryIds([{ id: 'a', key: 'k1' }])).toEqual([]);
      expect(findDuplicateMemoryIds([])).toEqual([]);
    });
  });

  describe('groupMemoriesByKeyPrefix', () => {
    it('groups by the first two underscore tokens', () => {
      const groups = groupMemoriesByKeyPrefix([
        { id: 'a', key: 'product_offer_x' },
        { id: 'b', key: 'product_offer_y' },
        { id: 'c', key: 'lead_status_open' },
      ]);
      expect(groups.get('product_offer')?.map((m) => m.id)).toEqual(['a', 'b']);
      expect(groups.get('lead_status')?.map((m) => m.id)).toEqual(['c']);
    });

    it('handles single-token keys as their own group', () => {
      const groups = groupMemoriesByKeyPrefix([{ id: 'a', key: 'singleton' }]);
      expect(groups.get('singleton')?.map((m) => m.id)).toEqual(['a']);
    });
  });

  describe('pickStaleSemanticDuplicateIds', () => {
    it('keeps the most recent entry and returns the rest', () => {
      const ids = pickStaleSemanticDuplicateIds([
        { id: 'old', updatedAt: new Date('2026-01-01T00:00:00Z') },
        { id: 'new', updatedAt: new Date('2026-02-01T00:00:00Z') },
        { id: 'mid', updatedAt: new Date('2026-01-15T00:00:00Z') },
      ]);
      // Sorted desc: new, mid, old → keep new, drop mid + old
      expect(ids).toEqual(['mid', 'old']);
    });

    it('accepts ISO-string updatedAt values', () => {
      const ids = pickStaleSemanticDuplicateIds([
        { id: 'old', updatedAt: '2026-01-01T00:00:00Z' },
        { id: 'new', updatedAt: '2026-02-01T00:00:00Z' },
      ]);
      expect(ids).toEqual(['old']);
    });

    it('returns empty for single-element or empty input', () => {
      expect(pickStaleSemanticDuplicateIds([])).toEqual([]);
      expect(pickStaleSemanticDuplicateIds([{ id: 'a', updatedAt: new Date() }])).toEqual([]);
    });
  });

  describe('findOrphanWorkspaceIds', () => {
    it('returns memory workspace IDs not present in alive list', () => {
      expect(findOrphanWorkspaceIds(['ws-a', 'ws-b', 'ws-c'], ['ws-a', 'ws-c'])).toEqual(['ws-b']);
    });

    it('returns empty when all alive', () => {
      expect(findOrphanWorkspaceIds(['ws-a'], ['ws-a'])).toEqual([]);
    });

    it('returns the full input when nothing is alive', () => {
      expect(findOrphanWorkspaceIds(['ws-a', 'ws-b'], [])).toEqual(['ws-a', 'ws-b']);
    });
  });
});
