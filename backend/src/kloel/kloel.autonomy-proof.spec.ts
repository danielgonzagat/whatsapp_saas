import {
  normalizePhone,
  normalizeChatId,
  phoneFromChatId,
  currentBacklog,
  makeProofCtx,
  EXPECTED_TOOL_ALPHABET,
} from './kloel.autonomy-proof.helpers';

describe('KloelService bounded autonomy proof — part 1 (helpers + alphabet)', () => {
  describe('normalizePhone', () => {
    it('strips non-digit characters', () => {
      expect(normalizePhone('55 (11) 99999-1111')).toBe('5511999991111');
    });

    it('returns empty string for empty input', () => {
      expect(normalizePhone('')).toBe('');
    });

    it('handles stringified number', () => {
      expect(normalizePhone('123')).toBe('123');
    });
  });

  describe('normalizeChatId', () => {
    it('appends @c.us to bare phone', () => {
      expect(normalizeChatId('5511999991111')).toBe('5511999991111@c.us');
    });

    it('strips non-digit from phone before appending suffix', () => {
      expect(normalizeChatId('55 (11) 99999-1111')).toBe('5511999991111@c.us');
    });

    it('preserves existing @c.us suffix', () => {
      expect(normalizeChatId('5511999991111@c.us')).toBe('5511999991111@c.us');
    });

    it('returns empty string for empty input', () => {
      expect(normalizeChatId('')).toBe('');
    });
  });

  describe('phoneFromChatId', () => {
    it('extracts phone from chat id', () => {
      expect(phoneFromChatId('5511999991111@c.us')).toBe('5511999991111');
    });

    it('strips formatting from chat id phone', () => {
      expect(phoneFromChatId('55(11)99999-1111@c.us')).toBe('5511999991111');
    });
  });

  describe('currentBacklog', () => {
    it('reports disconnected state', () => {
      const bl = currentBacklog({ connected: false }, new Map());
      expect(bl.connected).toBe(false);
      expect(bl.status).toBe('SCAN_QR_CODE');
      expect(bl.pendingMessages).toBe(0);
      expect(bl.pendingConversations).toBe(0);
    });

    it('reports working state with no pending chats', () => {
      const bl = currentBacklog({ connected: true }, new Map());
      expect(bl.connected).toBe(true);
      expect(bl.status).toBe('WORKING');
      expect(bl.pendingMessages).toBe(0);
    });
  });

  describe('makeProofCtx', () => {
    it('creates ctx with initial state', () => {
      const ctx = makeProofCtx();
      expect(ctx.activeCycle).toBe(0);
      expect(ctx.world.connected).toBe(false);
      expect(ctx.trace).toEqual([]);
      expect(ctx.worldChats.size).toBe(0);
      expect(ctx.worldMessages.size).toBe(0);
    });
  });

  describe('EXPECTED_TOOL_ALPHABET', () => {
    it('contains all required WhatsApp action tools', () => {
      const required = [
        'connect_whatsapp',
        'get_whatsapp_status',
        'sync_whatsapp_history',
        'get_whatsapp_backlog',
        'send_whatsapp_message',
        'set_whatsapp_presence',
      ];
      for (const tool of required) {
        expect(EXPECTED_TOOL_ALPHABET).toContain(tool);
      }
    });

    it('has no duplicates', () => {
      expect(new Set(EXPECTED_TOOL_ALPHABET).size).toBe(EXPECTED_TOOL_ALPHABET.length);
    });
  });
});
