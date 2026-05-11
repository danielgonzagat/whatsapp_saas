import { CiaChatFilterService } from './cia-chat-filter.service';
import type { WahaChatSummary } from './providers/whatsapp-api.provider';

function makeChat(overrides: Partial<WahaChatSummary> = {}): WahaChatSummary {
  return {
    id: '5511999999999@c.us',
    unreadCount: 0,
    timestamp: Date.now() - 60 * 60_000,
    lastMessageTimestamp: Date.now() - 60 * 60_000,
    lastMessageRecvTimestamp: Date.now() - 60 * 60_000,
    lastMessageFromMe: null,
    ...overrides,
  };
}

describe('CiaChatFilterService', () => {
  let service: CiaChatFilterService;

  beforeEach(() => {
    service = new CiaChatFilterService();
  });

  describe('normalizeChats', () => {
    it('converts a raw provider chat list into typed WahaChatSummary[]', () => {
      const now = Date.now();
      const raw = [
        {
          id: { _serialized: '5511999999999@c.us' },
          unreadCount: 3,
          lastMessage: { timestamp: now - 1000, fromMe: false },
        },
        {
          id: { _serialized: '5511888888888@c.us' },
          unreadCount: 0,
          lastMessage: { timestamp: now - 5000, fromMe: true },
        },
      ];

      const chats = service.normalizeChats(raw);
      expect(chats).toHaveLength(2);
      expect(chats[0].id).toBe('5511999999999@c.us');
      expect(chats[0].unreadCount).toBe(3);
      expect(chats[0].lastMessageFromMe).toBe(false);
      expect(chats[1].id).toBe('5511888888888@c.us');
      expect(chats[1].lastMessageFromMe).toBe(true);
    });

    it('accepts { chats: [...] } wrapper shape', () => {
      const chats = service.normalizeChats({
        chats: [{ id: '5511999999999@c.us', unreadCount: 1 }],
      });

      expect(chats).toHaveLength(1);
      expect(chats[0].id).toBe('5511999999999@c.us');
    });

    it('accepts { items: [...] } wrapper shape', () => {
      const chats = service.normalizeChats({
        items: [{ id: '5511888888888@c.us', unreadCount: 2 }],
      });

      expect(chats).toHaveLength(1);
      expect(chats[0].id).toBe('5511888888888@c.us');
    });

    it('accepts { data: [...] } wrapper shape', () => {
      const chats = service.normalizeChats({
        data: [{ id: '5511777777777@c.us', unreadCount: 5 }],
      });

      expect(chats).toHaveLength(1);
      expect(chats[0].id).toBe('5511777777777@c.us');
    });

    it('returns an empty array for null/undefined input', () => {
      expect(service.normalizeChats(null)).toEqual([]);
      expect(service.normalizeChats(undefined)).toEqual([]);
    });

    it('returns an empty array for non-object primitives', () => {
      expect(service.normalizeChats(42)).toEqual([]);
      expect(service.normalizeChats('abc')).toEqual([]);
    });

    it('filters out chats that resolve to empty id', () => {
      const raw = [
        { unreadCount: 1, lastMessageTimestamp: Date.now() },
        { id: 'valid@c.us', unreadCount: 2 },
      ];

      const chats = service.normalizeChats(raw);
      expect(chats).toHaveLength(1);
      expect(chats[0].id).toBe('valid@c.us');
    });

    it('resolves chat id from fallback fields when _serialized is absent', () => {
      const raw = [
        { id: 'fallback-id@c.us', unreadCount: 1, lastMessage: { timestamp: Date.now() } },
        { chatId: 'chat-id-fallback@c.us', unreadCount: 1, lastMessage: { timestamp: Date.now() } },
        { wid: 'wid-fallback@c.us', unreadCount: 1, lastMessage: { timestamp: Date.now() } },
      ];

      const chats = service.normalizeChats(raw);
      expect(chats).toHaveLength(3);
      expect(chats[0].id).toBe('fallback-id@c.us');
      expect(chats[1].id).toBe('chat-id-fallback@c.us');
      expect(chats[2].id).toBe('wid-fallback@c.us');
    });
  });

  describe('resolveChatTimestamp', () => {
    it('returns millisecond timestamp from a number candidate', () => {
      const ts = service.resolveChatTimestamp([1710800000000]);
      expect(ts).toBe(1710800000000);
    });

    it('converts second-level timestamps (< 1e12) to milliseconds', () => {
      const ts = service.resolveChatTimestamp([1710800000]);
      expect(ts).toBe(1710800000000);
    });

    it('parses ISO string candidates into millisecond timestamps', () => {
      const ts = service.resolveChatTimestamp(['2026-03-19T12:00:00.000Z']);
      expect(Number.isFinite(ts)).toBe(true);
      expect(ts).toBeGreaterThan(0);
    });

    it('returns 0 when no valid candidates exist', () => {
      const ts = service.resolveChatTimestamp([null, undefined, 'invalid', NaN]);
      expect(ts).toBe(0);
    });

    it('picks the first valid candidate from the list', () => {
      const ts = service.resolveChatTimestamp([NaN, 1710800000000, 1710900000000]);
      expect(ts).toBe(1710800000000);
    });
  });

  describe('isRemotePendingChat', () => {
    it('returns true when unreadCount > 0', () => {
      const chat = makeChat({ unreadCount: 3 });
      expect(service.isRemotePendingChat(chat, false)).toBe(true);
    });

    it('returns true when lastMessageFromMe is false with fresh activity', () => {
      const chat = makeChat({
        unreadCount: 0,
        timestamp: Date.now() - 60_000,
        lastMessageFromMe: false,
      });
      expect(service.isRemotePendingChat(chat, false)).toBe(true);
    });

    it('returns true for unknown pending signal with fresh activity', () => {
      const chat = makeChat({
        unreadCount: 0,
        timestamp: Date.now() - 60_000,
        lastMessageFromMe: null,
        lastMessageRecvTimestamp: Date.now() - 60_000,
      });
      expect(service.isRemotePendingChat(chat, false)).toBe(true);
    });

    it('returns false for stale unknown pending signal', () => {
      const staleMs = Date.now() - 100 * 24 * 60 * 60_000;
      const chat = makeChat({
        unreadCount: 0,
        timestamp: staleMs,
        lastMessageTimestamp: staleMs,
        lastMessageFromMe: null,
        lastMessageRecvTimestamp: staleMs,
      });
      expect(service.isRemotePendingChat(chat, false)).toBe(false);
    });

    it('respects includeZeroUnreadActivity when lastMessageFromMe is not false', () => {
      const chat = makeChat({
        unreadCount: 0,
        timestamp: Date.now() - 60_000,
        lastMessageFromMe: true,
      });
      expect(service.isRemotePendingChat(chat, true)).toBe(true);
      expect(service.isRemotePendingChat(chat, false)).toBe(false);
    });

    it('returns false for stale lastMessageFromMe=false activity', () => {
      const staleMs = Date.now() - 100 * 24 * 60 * 60_000;
      const chat = makeChat({
        unreadCount: 0,
        timestamp: staleMs,
        lastMessageTimestamp: staleMs,
        lastMessageFromMe: false,
      });
      expect(service.isRemotePendingChat(chat, false)).toBe(false);
    });
  });

  describe('selectRemotePendingChats', () => {
    it('filters and sorts chats by activity timestamp descending', () => {
      const now = Date.now();
      const chats = [
        makeChat({ id: 'a', unreadCount: 0, timestamp: now - 5000, lastMessageFromMe: false }),
        makeChat({ id: 'b', unreadCount: 3, timestamp: now - 86_400_000 }),
        makeChat({ id: 'c', unreadCount: 0, timestamp: now - 1000, lastMessageFromMe: false }),
        makeChat({
          id: 'd',
          unreadCount: 0,
          timestamp: now - 30 * 24 * 60 * 60_000,
          lastMessageFromMe: true,
        }),
      ];

      const pending = service.selectRemotePendingChats(chats);
      expect(pending).toHaveLength(3);
      expect(pending.map((c) => c.id)).toEqual(['c', 'a', 'b']);
    });

    it('breaks timestamp ties by unreadCount then by id', () => {
      const now = Date.now();
      const chats = [
        makeChat({ id: 'z', unreadCount: 2, timestamp: now - 10_000, lastMessageFromMe: false }),
        makeChat({ id: 'a', unreadCount: 2, timestamp: now - 10_000, lastMessageFromMe: false }),
        makeChat({ id: 'm', unreadCount: 5, timestamp: now - 10_000, lastMessageFromMe: false }),
      ];

      const pending = service.selectRemotePendingChats(chats);
      expect(pending.map((c) => c.id)).toEqual(['m', 'a', 'z']);
    });

    it('returns empty array for empty input', () => {
      expect(service.selectRemotePendingChats([])).toEqual([]);
    });
  });

  describe('estimatePendingMessages', () => {
    it('returns at least 1 when lastMessageFromMe is false', () => {
      const chat = makeChat({ unreadCount: 0, lastMessageFromMe: false });
      expect(service.estimatePendingMessages(chat)).toBe(1);
    });

    it('returns unreadCount when higher than fallback', () => {
      const chat = makeChat({ unreadCount: 7, lastMessageFromMe: false });
      expect(service.estimatePendingMessages(chat)).toBe(7);
    });

    it('returns at least 1 even without direction', () => {
      const chat = makeChat({ unreadCount: 0, lastMessageFromMe: null });
      expect(service.estimatePendingMessages(chat)).toBe(1);
    });
  });

  describe('resolveInlineBacklogFallbackLimit', () => {
    it('clamps to the CIA_INLINE_BACKLOG_FALLBACK_LIMIT ceiling', () => {
      const limit = service.resolveInlineBacklogFallbackLimit(500);
      expect(limit).toBeGreaterThanOrEqual(1);
      expect(limit).toBeLessThanOrEqual(50);
    });

    it('returns at least 1 even for non-positive input', () => {
      const limit = service.resolveInlineBacklogFallbackLimit(0);
      expect(limit).toBeGreaterThanOrEqual(1);
    });

    it('clamps to 50 even for very large input', () => {
      const limit = service.resolveInlineBacklogFallbackLimit(9999);
      expect(limit).toBeLessThanOrEqual(50);
    });
  });

  describe('hasUnknownPendingSignal', () => {
    it('returns true when lastMessageFromMe is null and recvTimestamp > 0', () => {
      const chat = makeChat({
        lastMessageFromMe: null,
        lastMessageRecvTimestamp: Date.now() - 10_000,
      });
      expect(service.hasUnknownPendingSignal(chat)).toBe(true);
    });

    it('returns false when lastMessageFromMe is true', () => {
      const chat = makeChat({
        lastMessageFromMe: true,
        lastMessageRecvTimestamp: Date.now() - 10_000,
      });
      expect(service.hasUnknownPendingSignal(chat)).toBe(false);
    });

    it('returns false when recvTimestamp is 0', () => {
      const chat = makeChat({
        lastMessageFromMe: null,
        lastMessageRecvTimestamp: 0,
      });
      expect(service.hasUnknownPendingSignal(chat)).toBe(false);
    });
  });

  describe('isRecentRemoteBatch', () => {
    it('returns true when latest message is within 24h', () => {
      const messages = [{ createdAt: new Date().toISOString() }];
      expect(service.isRecentRemoteBatch(messages)).toBe(true);
    });

    it('returns false when latest message is older than 24h', () => {
      const messages = [{ createdAt: new Date(Date.now() - 48 * 60 * 60_000).toISOString() }];
      expect(service.isRecentRemoteBatch(messages)).toBe(false);
    });

    it('returns false for empty array', () => {
      expect(service.isRecentRemoteBatch([])).toBe(false);
    });
  });
});
