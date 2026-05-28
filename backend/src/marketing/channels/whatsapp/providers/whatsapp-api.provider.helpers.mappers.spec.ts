import {
  clampChatMessagePagination,
  composeWhatsAppChatId,
  mapContactRowToWahaContact,
  mapConversationRowToWahaChat,
  mapMessageRowToWahaMessage,
} from './whatsapp-api.provider.helpers';

describe('whatsapp-api.provider.helpers (mappers + pagination)', () => {
  describe('composeWhatsAppChatId', () => {
    it('should append the WAHA suffix to the phone', () => {
      expect(composeWhatsAppChatId('5511999999999')).toBe('5511999999999@s.whatsapp.net');
    });

    it('should accept an already-formatted-looking string', () => {
      expect(composeWhatsAppChatId('+5511999999999')).toBe('+5511999999999@s.whatsapp.net');
    });

    it('should compose against empty string', () => {
      expect(composeWhatsAppChatId('')).toBe('@s.whatsapp.net');
    });
  });

  describe('mapContactRowToWahaContact', () => {
    const baseContact = {
      phone: '5511999999999',
      name: 'Cliente Teste',
      email: 'cliente@kloel.test',
      createdAt: new Date('2026-01-01T10:00:00Z'),
      updatedAt: new Date('2026-01-02T10:00:00Z'),
    };

    it('should map a full contact row', () => {
      expect(mapContactRowToWahaContact(baseContact)).toEqual({
        id: '5511999999999@s.whatsapp.net',
        phone: '5511999999999',
        name: 'Cliente Teste',
        pushName: 'Cliente Teste',
        email: 'cliente@kloel.test',
        source: 'crm',
        createdAt: '2026-01-01T10:00:00.000Z',
        updatedAt: '2026-01-02T10:00:00.000Z',
      });
    });

    it('should null-coalesce missing name and email', () => {
      const result = mapContactRowToWahaContact({
        phone: '5511888888888',
        name: null,
        email: null,
        createdAt: new Date('2026-01-01T10:00:00Z'),
        updatedAt: new Date('2026-01-01T10:00:00Z'),
      });
      expect(result.name).toBeNull();
      expect(result.pushName).toBeNull();
      expect(result.email).toBeNull();
    });

    it('should null-coalesce empty-string name (matches legacy contract)', () => {
      const result = mapContactRowToWahaContact({
        ...baseContact,
        name: '',
      });
      expect(result.name).toBeNull();
      expect(result.pushName).toBeNull();
    });

    it('should always set source = crm', () => {
      expect(mapContactRowToWahaContact(baseContact).source).toBe('crm');
    });
  });

  describe('mapConversationRowToWahaChat', () => {
    it('should build a chat id from the contact phone', () => {
      const result = mapConversationRowToWahaChat({
        id: 'conv-1',
        unreadCount: 3,
        lastMessageAt: new Date('2026-01-01T10:00:00Z'),
        contact: { phone: '5511999999999', name: 'Cliente' },
      });
      expect(result.id).toBe('5511999999999@s.whatsapp.net');
      expect(result.phone).toBe('5511999999999');
      expect(result.name).toBe('Cliente');
      expect(result.unreadCount).toBe(3);
      expect(result.timestamp).toBe(new Date('2026-01-01T10:00:00Z').getTime());
      expect(result.lastMessageAt).toBe('2026-01-01T10:00:00.000Z');
      expect(result.source).toBe('crm');
    });

    it('should fall back to conversation id when phone is missing', () => {
      const result = mapConversationRowToWahaChat({
        id: 'conv-1',
        contact: { phone: '', name: null },
      });
      expect(result.id).toBe('conv-1');
      expect(result.phone).toBe('');
      expect(result.name).toBeNull();
    });

    it('should fall back to phone for name when name is missing', () => {
      const result = mapConversationRowToWahaChat({
        id: 'conv-1',
        contact: { phone: '5511777777777', name: null },
      });
      expect(result.name).toBe('5511777777777');
    });

    it('should default unread count to 0', () => {
      const result = mapConversationRowToWahaChat({
        id: 'conv-1',
        contact: { phone: '5511999999999' },
      });
      expect(result.unreadCount).toBe(0);
    });

    it('should default timestamp to Date.now() when no lastMessageAt', () => {
      const before = Date.now();
      const result = mapConversationRowToWahaChat({
        id: 'conv-1',
        contact: { phone: '5511999999999' },
      });
      const after = Date.now();
      expect(result.timestamp).toBeGreaterThanOrEqual(before);
      expect(result.timestamp).toBeLessThanOrEqual(after);
      expect(result.lastMessageAt).toBeNull();
    });

    it('should null contact entirely without crashing', () => {
      const result = mapConversationRowToWahaChat({
        id: 'conv-1',
        contact: null,
      });
      expect(result.id).toBe('conv-1');
      expect(result.phone).toBe('');
    });
  });

  describe('mapMessageRowToWahaMessage', () => {
    const baseMessage = {
      id: 'msg-internal-1',
      content: 'Olá',
      direction: 'INBOUND',
      status: 'DELIVERED',
      createdAt: new Date('2026-01-01T10:00:00Z'),
      mediaUrl: null,
      externalId: 'wa-123',
      type: 'TEXT',
    };

    it('should map a full message row', () => {
      expect(mapMessageRowToWahaMessage(baseMessage, '5511999999999')).toEqual({
        id: 'wa-123',
        chatId: '5511999999999@s.whatsapp.net',
        phone: '5511999999999',
        body: 'Olá',
        direction: 'INBOUND',
        fromMe: false,
        type: 'text',
        hasMedia: false,
        mediaUrl: null,
        timestamp: new Date('2026-01-01T10:00:00Z').getTime(),
        isoTimestamp: '2026-01-01T10:00:00.000Z',
        source: 'crm',
        status: 'DELIVERED',
      });
    });

    it('should fall back to internal id when externalId is missing', () => {
      const result = mapMessageRowToWahaMessage(
        { ...baseMessage, externalId: null },
        '5511999999999',
      );
      expect(result.id).toBe('msg-internal-1');
    });

    it('should set fromMe=true for OUTBOUND direction', () => {
      const result = mapMessageRowToWahaMessage(
        { ...baseMessage, direction: 'OUTBOUND' },
        '5511999999999',
      );
      expect(result.fromMe).toBe(true);
    });

    it('should mark hasMedia=true when mediaUrl is set', () => {
      const result = mapMessageRowToWahaMessage(
        { ...baseMessage, mediaUrl: 'https://cdn.test/file.png', type: 'IMAGE' },
        '5511999999999',
      );
      expect(result.hasMedia).toBe(true);
      expect(result.mediaUrl).toBe('https://cdn.test/file.png');
      expect(result.type).toBe('image');
    });

    it('should default body to empty string when content is null', () => {
      const result = mapMessageRowToWahaMessage({ ...baseMessage, content: null }, '5511999999999');
      expect(result.body).toBe('');
    });

    it('should default type to "text" (lowercased TEXT) when type is missing', () => {
      const result = mapMessageRowToWahaMessage({ ...baseMessage, type: null }, '5511999999999');
      expect(result.type).toBe('text');
    });

    it('should null-coalesce status when missing', () => {
      const result = mapMessageRowToWahaMessage({ ...baseMessage, status: null }, '5511999999999');
      expect(result.status).toBeNull();
    });

    it('should always set source = crm', () => {
      expect(mapMessageRowToWahaMessage(baseMessage, '5511999999999').source).toBe('crm');
    });
  });

  describe('clampChatMessagePagination', () => {
    it('should default to take=100, skip=0 when no options', () => {
      expect(clampChatMessagePagination()).toEqual({ take: 100, skip: 0 });
    });

    it('should default to take=100, skip=0 when empty options', () => {
      expect(clampChatMessagePagination({})).toEqual({ take: 100, skip: 0 });
    });

    it('should clamp limit upper bound to 200', () => {
      expect(clampChatMessagePagination({ limit: 1000 })).toEqual({ take: 200, skip: 0 });
    });

    it('should clamp limit lower bound to 1', () => {
      expect(clampChatMessagePagination({ limit: 0 })).toEqual({ take: 100, skip: 0 });
    });

    it('should treat negative limit as default via Number() fallback', () => {
      // Number(-5 || 100) || 100 → 100 (negative is truthy, so it actually passes through)
      // After Math.min(200, -5) = -5, Math.max(1, -5) = 1
      expect(clampChatMessagePagination({ limit: -5 })).toEqual({ take: 1, skip: 0 });
    });

    it('should clamp offset lower bound to 0', () => {
      expect(clampChatMessagePagination({ offset: -10 })).toEqual({ take: 100, skip: 0 });
    });

    it('should accept a mid-range limit and offset', () => {
      expect(clampChatMessagePagination({ limit: 50, offset: 200 })).toEqual({
        take: 50,
        skip: 200,
      });
    });

    it('should handle NaN limit via Number() fallback', () => {
      expect(clampChatMessagePagination({ limit: Number.NaN })).toEqual({ take: 100, skip: 0 });
    });

    it('should handle NaN offset via Number() fallback', () => {
      expect(clampChatMessagePagination({ offset: Number.NaN })).toEqual({ take: 100, skip: 0 });
    });
  });
});
