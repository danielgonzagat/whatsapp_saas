import { CiaChatFilterService } from './cia-chat-filter.service';

describe('CiaChatFilterService', () => {
  const svc = new CiaChatFilterService();

  describe('resolveChatTimestamp', () => {
    it('returns first finite numeric candidate, scaling seconds → ms', () => {
      const seconds = 1_700_000_000;
      expect(svc.resolveChatTimestamp([seconds])).toBe(seconds * 1000);
    });

    it('treats values >1e12 as already-ms timestamps', () => {
      const ms = 1_700_000_000_000;
      expect(svc.resolveChatTimestamp([ms])).toBe(ms);
    });

    it('parses ISO date strings', () => {
      const ts = svc.resolveChatTimestamp(['2026-01-01T00:00:00Z']);
      expect(ts).toBe(Date.parse('2026-01-01T00:00:00Z'));
    });

    it('returns 0 when no candidates are usable', () => {
      expect(svc.resolveChatTimestamp([null, undefined, 'not-a-date'])).toBe(0);
    });
  });

  describe('normalizeChats', () => {
    it('returns empty array on null/non-iterable input', () => {
      expect(svc.normalizeChats(null)).toEqual([]);
      expect(svc.normalizeChats({ unrelated: true })).toEqual([]);
    });

    it('accepts {chats: []}, {items: []}, {data: []}, or plain array', () => {
      expect(svc.normalizeChats({ chats: [{ id: 'a' }] })).toHaveLength(1);
      expect(svc.normalizeChats({ items: [{ id: 'b' }] })).toHaveLength(1);
      expect(svc.normalizeChats({ data: [{ id: 'c' }] })).toHaveLength(1);
      expect(svc.normalizeChats([{ id: 'd' }])).toHaveLength(1);
    });

    it('filters out chats with empty ids', () => {
      const result = svc.normalizeChats([{ id: 'a' }, {}, { id: 'b' }]);
      expect(result.map((c) => c.id)).toEqual(['a', 'b']);
    });
  });

  describe('hasUnknownPendingSignal', () => {
    it('returns true when lastMessageFromMe is unknown AND recvTimestamp > 0', () => {
      expect(
        svc.hasUnknownPendingSignal({
          id: 'a',
          unreadCount: 0,
          timestamp: 0,
          lastMessageTimestamp: 0,
          lastMessageRecvTimestamp: 12345,
          lastMessageFromMe: null,
        } as never),
      ).toBe(true);
    });

    it('returns false when lastMessageFromMe is known', () => {
      expect(
        svc.hasUnknownPendingSignal({
          id: 'a',
          unreadCount: 0,
          timestamp: 0,
          lastMessageTimestamp: 0,
          lastMessageRecvTimestamp: 12345,
          lastMessageFromMe: false,
        } as never),
      ).toBe(false);
    });
  });

  describe('isRemotePendingChat', () => {
    it('returns true immediately when unreadCount > 0', () => {
      expect(
        svc.isRemotePendingChat(
          {
            id: 'a',
            unreadCount: 1,
            timestamp: 0,
            lastMessageTimestamp: 0,
            lastMessageRecvTimestamp: 0,
            lastMessageFromMe: true,
          } as never,
          false,
        ),
      ).toBe(true);
    });

    it('returns false when activity is too stale', () => {
      const longAgo = Date.now() - 365 * 24 * 60 * 60 * 1000; // 1 year ago
      expect(
        svc.isRemotePendingChat(
          {
            id: 'a',
            unreadCount: 0,
            timestamp: longAgo,
            lastMessageTimestamp: longAgo,
            lastMessageRecvTimestamp: longAgo,
            lastMessageFromMe: false,
          } as never,
          true,
        ),
      ).toBe(false);
    });

    it('returns true on fresh activity with lastMessageFromMe=false', () => {
      const now = Date.now();
      expect(
        svc.isRemotePendingChat(
          {
            id: 'a',
            unreadCount: 0,
            timestamp: now,
            lastMessageTimestamp: now,
            lastMessageRecvTimestamp: now,
            lastMessageFromMe: false,
          } as never,
          false,
        ),
      ).toBe(true);
    });
  });

  describe('estimatePendingMessages', () => {
    it('returns max(1, unreadCount, fromMe=false ? 1 : 0)', () => {
      expect(svc.estimatePendingMessages({ unreadCount: 5 } as never)).toBe(5);
      expect(svc.estimatePendingMessages({ unreadCount: 0, lastMessageFromMe: false } as never)).toBe(1);
      expect(svc.estimatePendingMessages({} as never)).toBe(1);
    });
  });

  describe('resolveInlineBacklogFallbackLimit', () => {
    it('clamps to [1, 10] by default', () => {
      expect(svc.resolveInlineBacklogFallbackLimit(0)).toBeGreaterThanOrEqual(1);
      expect(svc.resolveInlineBacklogFallbackLimit(99999)).toBeLessThanOrEqual(10);
    });
  });

  describe('isRecentRemoteBatch', () => {
    it('returns true when newest message is within 24h', () => {
      expect(svc.isRecentRemoteBatch([{ createdAt: new Date().toISOString() }])).toBe(true);
    });

    it('returns false when newest message is older than 24h', () => {
      const old = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
      expect(svc.isRecentRemoteBatch([{ createdAt: old }])).toBe(false);
    });

    it('returns false on empty list', () => {
      expect(svc.isRecentRemoteBatch([])).toBe(false);
    });
  });
});
