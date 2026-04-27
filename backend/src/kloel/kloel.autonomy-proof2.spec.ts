import {
  asStr,
  upsertChat,
  parseEvents,
  currentBacklog,
  ctxTick,
  makeProofCtx,
  ALICE_PHONE,
} from './kloel.autonomy-proof.helpers';
import type { WorldChat } from './kloel.autonomy-proof.helpers';

describe('KloelService bounded autonomy proof — part 2 (presence + contacts + state)', () => {
  describe('asStr', () => {
    it('returns string as-is', () => {
      expect(asStr('hello')).toBe('hello');
    });

    it('returns fallback for undefined', () => {
      expect(asStr(undefined, 'fallback')).toBe('fallback');
    });

    it('returns fallback for null', () => {
      expect(asStr(null, 'fallback')).toBe('fallback');
    });

    it('returns empty string fallback by default', () => {
      expect(asStr(null)).toBe('');
    });

    it('stringifies numbers', () => {
      expect(asStr(42)).toBe('42');
    });

    it('stringifies booleans', () => {
      expect(asStr(true)).toBe('true');
      expect(asStr(false)).toBe('false');
    });
  });

  describe('upsertChat', () => {
    it('inserts new chat into worldChats', () => {
      const chats = new Map<string, WorldChat>();
      upsertChat(chats, ALICE_PHONE, 'Alice', 3, 1_000_000);
      expect(chats.size).toBe(1);
      const chat = chats.get(ALICE_PHONE);
      expect(chat).toBeDefined();
      expect(chat.phone).toBe(ALICE_PHONE);
      expect(chat.name).toBe('Alice');
      expect(chat.unreadCount).toBe(3);
    });

    it('overwrites existing chat', () => {
      const chats = new Map<string, WorldChat>();
      upsertChat(chats, ALICE_PHONE, 'Alice', 3, 1_000_000);
      upsertChat(chats, ALICE_PHONE, 'Alice Updated', 0, 2_000_000);
      expect(chats.size).toBe(1);
      expect(chats.get(ALICE_PHONE).name).toBe('Alice Updated');
      expect(chats.get(ALICE_PHONE).unreadCount).toBe(0);
    });
  });

  describe('parseEvents', () => {
    it('parses SSE-like data chunks into objects', () => {
      const writes = [
        'data: {"type":"connect"}\n\n',
        'data: {"type":"status","connected":true}\n\n',
      ];
      const events = parseEvents(writes);
      expect(events).toHaveLength(2);
      expect(events[0]).toEqual({ type: 'connect' });
      expect(events[1]).toEqual({ type: 'status', connected: true });
    });

    it('handles empty writes', () => {
      expect(parseEvents([])).toEqual([]);
    });

    it('handles writes without separator', () => {
      expect(parseEvents(['data: {"key":"val"}'])).toHaveLength(1);
    });
  });

  describe('ctxTick', () => {
    it('increments clock by 1000ms', () => {
      const ctx = makeProofCtx();
      const initial = ctx.clock;
      const next = ctxTick(ctx);
      expect(next).toBe(initial + 1000);
      expect(ctx.clock).toBe(next);
    });
  });

  describe('currentBacklog with pending chats', () => {
    it('counts pending conversations and messages', () => {
      const chats = new Map<string, WorldChat>();
      upsertChat(chats, ALICE_PHONE, 'Alice', 3, 1_000_000);
      upsertChat(chats, '5511999992222', 'Bob', 2, 2_000_000);
      const bl = currentBacklog({ connected: true }, chats);
      expect(bl.pendingConversations).toBe(2);
      expect(bl.pendingMessages).toBe(5);
      expect(bl.chats).toHaveLength(2);
    });

    it('ignores chats with zero unread count', () => {
      const chats = new Map<string, WorldChat>();
      upsertChat(chats, ALICE_PHONE, 'Alice', 0, 1_000_000);
      const bl = currentBacklog({ connected: true }, chats);
      expect(bl.pendingConversations).toBe(0);
      expect(bl.pendingMessages).toBe(0);
    });
  });
});
