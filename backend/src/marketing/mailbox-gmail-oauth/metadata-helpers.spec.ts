import {
  buildMetadata,
  readSyncedMessageIds,
  mergeSyncMetadata,
} from './metadata-helpers';

describe('metadata-helpers', () => {
  describe('buildMetadata', () => {
    it('builds metadata object from token and profile', () => {
      const result = buildMetadata(
        {
          scope: 'gmail.readonly',
          token_type: 'Bearer',
        },
        { name: 'Test User', picture: 'https://pic.test/1' },
      );

      expect(result).toEqual(
        expect.objectContaining({
          scope: 'gmail.readonly',
          tokenType: 'Bearer',
          name: 'Test User',
          picture: 'https://pic.test/1',
          provider: 'gmail',
        }),
      );
      expect(result.updatedAt).toBeDefined();
    });

    it('falls back to default scope when token.scope is missing', () => {
      const result = buildMetadata({}, {});
      expect(result.scope).toContain('gmail');
    });

    it('falls back to Bearer when token_type missing', () => {
      const result = buildMetadata({}, {});
      expect(result.tokenType).toBe('Bearer');
    });
  });

  describe('readSyncedMessageIds', () => {
    it('returns empty array for null metadata', () => {
      expect(readSyncedMessageIds(null)).toEqual([]);
    });

    it('returns empty array when syncedMessageIds is not present', () => {
      expect(readSyncedMessageIds({ other: 'value' })).toEqual([]);
    });

    it('returns the syncedMessageIds array', () => {
      expect(readSyncedMessageIds({ syncedMessageIds: ['a', 'b'] })).toEqual([
        'a',
        'b',
      ]);
    });

    it('caps at 500 entries', () => {
      const ids = Array.from({ length: 600 }, (_, i) => `id-${i}`);
      const result = readSyncedMessageIds({ syncedMessageIds: ids });
      expect(result).toHaveLength(500);
      expect(result[0]).toBe('id-0');
    });
  });

  describe('mergeSyncMetadata', () => {
    it('merges syncedMessageIds into existing metadata', () => {
      const result = mergeSyncMetadata(
        { existingKey: 'value', syncedMessageIds: ['old'] },
        ['new'],
      );

      expect(result.existingKey).toBe('value');
      expect(result.syncedMessageIds).toEqual(['new']);
      expect(result.lastSyncAt).toBeDefined();
    });

    it('creates new metadata object when input is null', () => {
      const result = mergeSyncMetadata(null, ['id-1']);
      expect(result.syncedMessageIds).toEqual(['id-1']);
    });

    it('caps syncedMessageIds at last 500', () => {
      const ids = Array.from({ length: 600 }, (_, i) => `id-${i}`);
      const result = mergeSyncMetadata(null, ids);
      expect(result.syncedMessageIds).toHaveLength(500);
    });
  });
});
