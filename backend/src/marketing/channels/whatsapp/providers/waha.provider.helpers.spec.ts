import {
  buildChatIdCandidates,
  extractChatsPayload,
  formatChatId,
  getChatDedupKey,
} from './waha.provider.helpers';

describe('waha.provider.helpers', () => {
  describe('formatChatId', () => {
    it('appends @c.us to a bare digit string', () => {
      expect(formatChatId('5511999999999')).toBe('5511999999999@c.us');
    });

    it('strips formatting characters before appending @c.us', () => {
      expect(formatChatId('+55 (11) 99999-9999')).toBe('5511999999999@c.us');
    });

    it('passes already-formatted chat ids through unchanged', () => {
      expect(formatChatId('5511999999999@c.us')).toBe('5511999999999@c.us');
      expect(formatChatId('group-123@g.us')).toBe('group-123@g.us');
    });

    it('returns empty string for empty / whitespace input', () => {
      expect(formatChatId('')).toBe('');
      expect(formatChatId('   ')).toBe('');
    });
  });

  describe('buildChatIdCandidates', () => {
    it('produces unique candidates including both @c.us and @s.whatsapp.net variants', () => {
      const candidates = buildChatIdCandidates('5511999999999');
      expect(candidates).toContain('5511999999999');
      expect(candidates).toContain('5511999999999@c.us');
      expect(candidates).toContain('5511999999999@s.whatsapp.net');
      expect(new Set(candidates).size).toBe(candidates.length);
    });

    it('keeps an already-formatted chat id and adds the @s.whatsapp.net variant', () => {
      const candidates = buildChatIdCandidates('5511999999999@c.us');
      expect(candidates).toEqual(
        expect.arrayContaining(['5511999999999@c.us', '5511999999999@s.whatsapp.net']),
      );
    });

    it('returns an empty list when given an empty input', () => {
      expect(buildChatIdCandidates('')).toEqual([]);
    });
  });

  describe('extractChatsPayload', () => {
    it('returns arrays untouched', () => {
      const arr = [{ id: 'a' }, { id: 'b' }];
      expect(extractChatsPayload(arr)).toBe(arr);
    });

    it('unwraps envelopes with a `chats` array', () => {
      const arr = [{ id: 'a' }];
      expect(extractChatsPayload({ chats: arr })).toBe(arr);
    });

    it('returns empty array for nullish / non-envelope payloads', () => {
      expect(extractChatsPayload(undefined)).toEqual([]);
      expect(extractChatsPayload(null)).toEqual([]);
      expect(extractChatsPayload(42)).toEqual([]);
      expect(extractChatsPayload({ foo: 'bar' })).toEqual([]);
    });
  });

  describe('getChatDedupKey', () => {
    it('prefers `id` when present and trims whitespace', () => {
      expect(getChatDedupKey({ id: '  abc  ', phone: '999' })).toBe('abc');
    });

    it('falls back through chatId / contactId / phone / contact.phone', () => {
      expect(getChatDedupKey({ chatId: 'X' })).toBe('X');
      expect(getChatDedupKey({ contactId: 'Y' })).toBe('Y');
      expect(getChatDedupKey({ phone: 'Z' })).toBe('Z');
      expect(getChatDedupKey({ contact: { phone: 'W' } })).toBe('W');
    });

    it('coerces numeric ids to strings when no string candidate exists', () => {
      expect(getChatDedupKey({ id: 42 })).toBe('42');
    });

    it('returns empty string when no usable candidate is present', () => {
      expect(getChatDedupKey({})).toBe('');
      expect(getChatDedupKey({ id: '   ' })).toBe('');
      expect(getChatDedupKey(null)).toBe('');
    });
  });
});
