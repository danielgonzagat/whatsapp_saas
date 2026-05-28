import {
  MEMORY_EXPIRATION_DAYS,
  buildMemoryCleanupAuditDetails,
  buildWorkspaceCleanupFilter,
  composeMemoryPriorityValue,
  cutoffDateForCategory,
  findDuplicateMemoryIds,
  findOrphanWorkspaceIds,
  groupMemoriesByKeyPrefix,
  knownMemoryCategories,
  normalizeMemoryValue,
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

  describe('buildMemoryCleanupAuditDetails', () => {
    it('returns null when nothing was removed', () => {
      expect(
        buildMemoryCleanupAuditDetails({
          expiredRemoved: 0,
          duplicatesRemoved: 0,
          orphansRemoved: 0,
          totalBefore: 100,
          totalAfter: 100,
          durationMs: 12,
        }),
      ).toBeNull();
    });

    it('emits the full counter payload when at least one bucket removed rows', () => {
      const details = buildMemoryCleanupAuditDetails({
        expiredRemoved: 5,
        duplicatesRemoved: 0,
        orphansRemoved: 2,
        totalBefore: 100,
        totalAfter: 93,
        durationMs: 250,
      });
      expect(details).toEqual({
        expiredRemoved: 5,
        duplicatesRemoved: 0,
        orphansRemoved: 2,
        totalBefore: 100,
        totalAfter: 93,
        durationMs: 250,
      });
    });

    it('treats a single non-zero bucket as sufficient to audit', () => {
      const details = buildMemoryCleanupAuditDetails({
        expiredRemoved: 0,
        duplicatesRemoved: 1,
        orphansRemoved: 0,
        totalBefore: 10,
        totalAfter: 9,
        durationMs: 1,
      });
      expect(details?.duplicatesRemoved).toBe(1);
    });

    it('returns null when buckets sum to zero even with negative parity', () => {
      // Defensive: shouldn't happen in production but the helper must not
      // surface a misleading audit row.
      const details = buildMemoryCleanupAuditDetails({
        expiredRemoved: 1,
        duplicatesRemoved: -1,
        orphansRemoved: 0,
        totalBefore: 5,
        totalAfter: 5,
        durationMs: 0,
      });
      expect(details).toBeNull();
    });
  });

  describe('buildWorkspaceCleanupFilter', () => {
    it('returns just the workspaceId when no options supplied', () => {
      expect(buildWorkspaceCleanupFilter('ws-a')).toEqual({ workspaceId: 'ws-a' });
    });

    it('appends category when present', () => {
      expect(buildWorkspaceCleanupFilter('ws-a', { category: 'leads' })).toEqual({
        workspaceId: 'ws-a',
        category: 'leads',
      });
    });

    it('appends an updatedAt cutoff based on olderThanDays', () => {
      const now = new Date('2026-01-31T00:00:00Z');
      const filter = buildWorkspaceCleanupFilter('ws-a', { olderThanDays: 7 }, now);
      expect(filter.workspaceId).toBe('ws-a');
      const diffDays = Math.round(
        (now.getTime() - (filter.updatedAt?.lt.getTime() ?? 0)) / (1000 * 60 * 60 * 24),
      );
      expect(diffDays).toBe(7);
    });

    it('combines category and olderThanDays together', () => {
      const now = new Date('2026-01-31T00:00:00Z');
      const filter = buildWorkspaceCleanupFilter(
        'ws-a',
        { category: 'temporary', olderThanDays: 1 },
        now,
      );
      expect(filter.workspaceId).toBe('ws-a');
      expect(filter.category).toBe('temporary');
      expect(filter.updatedAt).toBeDefined();
    });

    it('does not append updatedAt when olderThanDays is not provided', () => {
      const filter = buildWorkspaceCleanupFilter('ws-a', { category: 'leads' });
      expect(filter.updatedAt).toBeUndefined();
    });

    it('always preserves the workspaceId argument exactly', () => {
      const filter = buildWorkspaceCleanupFilter('ws-protected', { category: 'leads' });
      expect(filter.workspaceId).toBe('ws-protected');
    });
  });

  describe('normalizeMemoryValue', () => {
    it('clones an object value defensively', () => {
      const source = { a: 1, b: 'two' };
      const normalized = normalizeMemoryValue(source);
      expect(normalized).toEqual(source);
      expect(normalized).not.toBe(source);
    });

    it('wraps primitives under `content`', () => {
      expect(normalizeMemoryValue('hello')).toEqual({ content: 'hello' });
      expect(normalizeMemoryValue(42)).toEqual({ content: 42 });
      expect(normalizeMemoryValue(true)).toEqual({ content: true });
    });

    it('wraps arrays under `content` (treated as primitive)', () => {
      expect(normalizeMemoryValue([1, 2, 3])).toEqual({ content: [1, 2, 3] });
    });

    it('wraps null/undefined under `content`', () => {
      expect(normalizeMemoryValue(null)).toEqual({ content: null });
      expect(normalizeMemoryValue(undefined)).toEqual({ content: undefined });
    });
  });

  describe('composeMemoryPriorityValue', () => {
    it('merges priority fields into an existing object value', () => {
      const now = new Date('2026-01-31T12:00:00Z');
      const result = composeMemoryPriorityValue({ a: 1 }, 'high', now);
      expect(result).toEqual({
        a: 1,
        _priority: 'high',
        _prioritySetAt: '2026-01-31T12:00:00.000Z',
      });
    });

    it('wraps a primitive value under `content` before stamping priority', () => {
      const now = new Date('2026-01-31T12:00:00Z');
      const result = composeMemoryPriorityValue('legacy', 'critical', now);
      expect(result).toEqual({
        content: 'legacy',
        _priority: 'critical',
        _prioritySetAt: '2026-01-31T12:00:00.000Z',
      });
    });

    it('overwrites a prior priority stamp on the same key', () => {
      const now = new Date('2026-01-31T12:00:00Z');
      const result = composeMemoryPriorityValue(
        { content: 'x', _priority: 'low', _prioritySetAt: '2025-01-01T00:00:00.000Z' },
        'normal',
        now,
      );
      expect(result._priority).toBe('normal');
      expect(result._prioritySetAt).toBe('2026-01-31T12:00:00.000Z');
    });

    it('does not mutate the original value object', () => {
      const original = { a: 1 };
      composeMemoryPriorityValue(original, 'low', new Date('2026-01-31T00:00:00Z'));
      expect(original).toEqual({ a: 1 });
    });
  });
});
