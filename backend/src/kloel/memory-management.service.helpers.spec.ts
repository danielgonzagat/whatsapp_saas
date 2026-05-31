import {
  buildSemanticDuplicateAuditDetails,
  buildWorkspaceCleanupAuditDetails,
  emptyMemoryStats,
  errorMessage,
  errorMessageOrString,
  formatCategoryCleanupFailureMessage,
  formatCleanupFailureMessage,
  formatCleanupSummaryMessage,
  formatDeduplicationFailureMessage,
  formatGetStatsFailureMessage,
  formatOrphanCleanupFailureMessage,
  formatStaleUncategorizedFailureMessage,
  formatStatsFailureMessage,
  formatWorkspaceCleanupMessage,
  type MemoryCleanupResult,
} from './memory-management.service.helpers';

describe('memory-management.service.helpers', () => {
  describe('errorMessage', () => {
    it('returns the Error message when input is an Error', () => {
      expect(errorMessage(new Error('boom'))).toBe('boom');
    });

    it('returns the default fallback for non-Error values', () => {
      expect(errorMessage('plain string')).toBe('unknown_error');
      expect(errorMessage(undefined)).toBe('unknown_error');
      expect(errorMessage(null)).toBe('unknown_error');
      expect(errorMessage(42)).toBe('unknown_error');
    });

    it('honors a custom fallback', () => {
      expect(errorMessage('plain string', 'custom_fallback')).toBe('custom_fallback');
    });
  });

  describe('errorMessageOrString', () => {
    it('returns the Error message for Error inputs', () => {
      expect(errorMessageOrString(new Error('boom'))).toBe('boom');
    });

    it('coerces non-Error inputs to their string form', () => {
      expect(errorMessageOrString('weird-throwable')).toBe('weird-throwable');
      expect(errorMessageOrString(42)).toBe('42');
      expect(errorMessageOrString({ code: 'X' })).toBe('[object Object]');
    });
  });

  describe('formatCleanupSummaryMessage', () => {
    it('renders all three counter slots verbatim', () => {
      const result: MemoryCleanupResult = {
        expiredRemoved: 3,
        duplicatesRemoved: 7,
        orphansRemoved: 2,
        totalBefore: 100,
        totalAfter: 88,
        duration: 1234,
      };
      expect(formatCleanupSummaryMessage(result)).toBe(
        'Cleanup complete: removed 3 expired, 7 duplicates, 2 orphans',
      );
    });
  });

  describe('formatWorkspaceCleanupMessage', () => {
    it('omits the category suffix when no category is supplied', () => {
      expect(formatWorkspaceCleanupMessage('ws-1', 5)).toBe(
        'Cleaned 5 memories from workspace ws-1',
      );
    });

    it('appends the category suffix when supplied', () => {
      expect(formatWorkspaceCleanupMessage('ws-1', 5, { category: 'leads' })).toBe(
        'Cleaned 5 memories from workspace ws-1 (category: leads)',
      );
    });

    it('omits the suffix when category is empty string', () => {
      expect(formatWorkspaceCleanupMessage('ws-1', 5, { category: '' })).toBe(
        'Cleaned 5 memories from workspace ws-1',
      );
    });
  });

  describe('buildWorkspaceCleanupAuditDetails', () => {
    it('always includes the deletedCount even when options are absent', () => {
      expect(buildWorkspaceCleanupAuditDetails(4)).toEqual({
        deletedCount: 4,
        category: undefined,
        olderThanDays: undefined,
      });
    });

    it('passes through category and olderThanDays when provided', () => {
      expect(
        buildWorkspaceCleanupAuditDetails(4, { category: 'leads', olderThanDays: 30 }),
      ).toEqual({
        deletedCount: 4,
        category: 'leads',
        olderThanDays: 30,
      });
    });
  });

  describe('buildSemanticDuplicateAuditDetails', () => {
    it('returns the canonical audit payload', () => {
      expect(buildSemanticDuplicateAuditDetails('leads', 9)).toEqual({
        category: 'leads',
        mergedCount: 9,
      });
    });
  });

  describe('failure message formatters', () => {
    it('formats the daily cleanup failure with an Error', () => {
      expect(formatCleanupFailureMessage(new Error('db down'))).toBe('Cleanup failed: db down');
    });

    it('formats the daily cleanup failure with a non-Error fallback', () => {
      expect(formatCleanupFailureMessage('???')).toBe('Cleanup failed: unknown_error');
    });

    it('formats the stats failure', () => {
      expect(formatStatsFailureMessage(new Error('boom'))).toBe(
        'Failed to update memory metrics: boom',
      );
    });

    it('formats the per-category cleanup failure', () => {
      expect(formatCategoryCleanupFailureMessage('leads', new Error('xx'))).toBe(
        'Failed to cleanup leads: xx',
      );
      expect(formatCategoryCleanupFailureMessage('leads', 'oops')).toBe(
        'Failed to cleanup leads: unknown_error',
      );
    });

    it('formats the stale uncategorized failure preserving non-Error values', () => {
      expect(formatStaleUncategorizedFailureMessage(new Error('boom'))).toBe(
        'Failed to remove stale uncategorized memories: boom',
      );
      expect(formatStaleUncategorizedFailureMessage('legacy-throwable')).toBe(
        'Failed to remove stale uncategorized memories: legacy-throwable',
      );
    });

    it('formats the deduplication failure', () => {
      expect(formatDeduplicationFailureMessage(new Error('dupe'))).toBe(
        'Deduplication failed: dupe',
      );
    });

    it('formats the orphan cleanup failure', () => {
      expect(formatOrphanCleanupFailureMessage(new Error('orphans'))).toBe(
        'Orphan cleanup failed: orphans',
      );
    });

    it('formats the getStats failure', () => {
      expect(formatGetStatsFailureMessage(new Error('stats'))).toBe('Failed to get stats: stats');
    });
  });

  describe('emptyMemoryStats', () => {
    it('returns the zero-state stats payload', () => {
      const stats = emptyMemoryStats();
      expect(stats).toEqual({
        total: 0,
        byCategory: {},
        byWorkspace: {},
        oldestEntry: null,
        averageAge: 0,
      });
    });

    it('returns a fresh, mutable object each call (callers must not share state)', () => {
      const a = emptyMemoryStats();
      const b = emptyMemoryStats();
      expect(a).not.toBe(b);
      expect(a.byCategory).not.toBe(b.byCategory);
      a.byCategory.test = 1;
      expect(b.byCategory).toEqual({});
    });
  });
});
