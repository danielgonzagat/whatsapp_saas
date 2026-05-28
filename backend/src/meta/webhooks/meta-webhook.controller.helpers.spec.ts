import {
  buildContactIndex,
  buildMetaExternalId,
  buildMetaIdempotencyKey,
  coerceLowerString,
  coerceUpperString,
  extractFirstStatusErrorCode,
  extractWhatsAppMessageText,
  normalizeOutboundStatus,
  normalizeWhatsAppMessageType,
} from './meta-webhook.controller.helpers';

describe('meta-webhook.controller.helpers', () => {
  describe('coerceLowerString', () => {
    it('trims and lowercases plain strings', () => {
      expect(coerceLowerString('  HELLO  ')).toBe('hello');
    });

    it('coerces numbers and booleans via String()', () => {
      expect(coerceLowerString(42)).toBe('42');
      expect(coerceLowerString(true)).toBe('true');
    });

    it('returns empty string for non-primitive values', () => {
      expect(coerceLowerString(undefined)).toBe('');
      expect(coerceLowerString(null)).toBe('');
      expect(coerceLowerString({})).toBe('');
      expect(coerceLowerString([])).toBe('');
    });
  });

  describe('coerceUpperString', () => {
    it('trims and uppercases plain strings', () => {
      expect(coerceUpperString('  hello  ')).toBe('HELLO');
    });

    it('coerces numbers and booleans via String()', () => {
      expect(coerceUpperString(42)).toBe('42');
      expect(coerceUpperString(false)).toBe('FALSE');
    });

    it('returns empty string for non-primitive values', () => {
      expect(coerceUpperString(undefined)).toBe('');
      expect(coerceUpperString({})).toBe('');
    });
  });

  describe('buildMetaIdempotencyKey', () => {
    it('uses the event id verbatim when supplied', () => {
      expect(buildMetaIdempotencyKey('evt-123', undefined, { object: 'page' })).toBe(
        'webhook:meta:evt-123',
      );
    });

    it('hashes the raw buffer when no event id is supplied', () => {
      const rawBody = Buffer.from(JSON.stringify({ object: 'page', entry: [] }));
      const key = buildMetaIdempotencyKey(undefined, rawBody, { object: 'page', entry: [] });
      expect(key).toMatch(/^webhook:meta:[0-9a-f]{32}$/);
    });

    it('produces a stable hash for identical bodies', () => {
      const body = { object: 'whatsapp_business_account', entry: [{ id: '1' }] };
      const rawBody = Buffer.from(JSON.stringify(body));
      const first = buildMetaIdempotencyKey(undefined, rawBody, body);
      const second = buildMetaIdempotencyKey(undefined, rawBody, body);
      expect(first).toBe(second);
    });

    it('falls back to JSON.stringify(body) when no raw buffer is provided', () => {
      const body = { object: 'instagram' };
      const key = buildMetaIdempotencyKey(undefined, undefined, body);
      expect(key).toMatch(/^webhook:meta:[0-9a-f]{32}$/);
    });

    it('accepts a raw string body and hashes it', () => {
      const key = buildMetaIdempotencyKey(undefined, '{"object":"page"}', { object: 'page' });
      expect(key).toMatch(/^webhook:meta:[0-9a-f]{32}$/);
    });

    it('still hashes when body is undefined and no raw buffer is supplied', () => {
      const key = buildMetaIdempotencyKey(undefined, undefined, undefined);
      expect(key).toMatch(/^webhook:meta:[0-9a-f]{32}$/);
    });
  });

  describe('buildMetaExternalId', () => {
    it('returns the event id verbatim when supplied', () => {
      expect(buildMetaExternalId('evt-abc', { object: 'page' })).toBe('evt-abc');
    });

    it('falls back to a meta_<sha256[..32]> token when no event id is supplied', () => {
      const externalId = buildMetaExternalId(undefined, { object: 'page', entry: [] });
      expect(externalId).toMatch(/^meta_[0-9a-f]{32}$/);
    });

    it('is deterministic for identical bodies', () => {
      const body = { object: 'whatsapp_business_account' };
      expect(buildMetaExternalId(undefined, body)).toBe(buildMetaExternalId(undefined, body));
    });

    it('handles undefined body via stable empty-object hash', () => {
      const externalId = buildMetaExternalId(undefined, undefined);
      expect(externalId).toMatch(/^meta_[0-9a-f]{32}$/);
    });
  });

  describe('buildContactIndex', () => {
    it('returns an empty Map when contacts is missing', () => {
      const index = buildContactIndex(undefined);
      expect(index).toBeInstanceOf(Map);
      expect(index.size).toBe(0);
    });

    it('returns an empty Map when contacts is not an array', () => {
      // Cast through unknown to simulate the runtime branch we defend against.
      const index = buildContactIndex('not-array' as unknown as never);
      expect(index.size).toBe(0);
    });

    it('builds a wa_id → trimmed-name map', () => {
      const index = buildContactIndex([
        { wa_id: '5511999990001', profile: { name: '  Alice  ' } },
        { wa_id: '5511999990002', profile: { name: 'Bob' } },
      ]);
      expect(index.get('5511999990001')).toBe('Alice');
      expect(index.get('5511999990002')).toBe('Bob');
    });

    it('falls back to empty strings when fields are missing', () => {
      const index = buildContactIndex([{}, { wa_id: '5511' }]);
      expect(index.get('')).toBe('');
      expect(index.get('5511')).toBe('');
    });
  });

  describe('normalizeWhatsAppMessageType', () => {
    it.each([
      ['text', 'text'],
      ['TEXT', 'text'],
      ['audio', 'audio'],
      ['voice', 'audio'],
      ['image', 'image'],
      ['document', 'document'],
      ['video', 'video'],
      ['sticker', 'sticker'],
    ] as const)('maps %s → %s', (input, expected) => {
      expect(normalizeWhatsAppMessageType(input)).toBe(expected);
    });

    it('falls back to "unknown" for unrecognised values', () => {
      expect(normalizeWhatsAppMessageType('reaction')).toBe('unknown');
      expect(normalizeWhatsAppMessageType(undefined)).toBe('unknown');
      expect(normalizeWhatsAppMessageType(null)).toBe('unknown');
      expect(normalizeWhatsAppMessageType({})).toBe('unknown');
    });

    it('coerces non-string primitives before matching', () => {
      expect(normalizeWhatsAppMessageType(0)).toBe('unknown');
      expect(normalizeWhatsAppMessageType(false)).toBe('unknown');
    });
  });

  describe('extractWhatsAppMessageText', () => {
    it('prefers text.body when present', () => {
      expect(extractWhatsAppMessageText({ text: { body: '  hello  ' } })).toBe('hello');
    });

    it('falls back to button.text', () => {
      expect(extractWhatsAppMessageText({ button: { text: 'Confirm' } })).toBe('Confirm');
    });

    it('falls back to interactive.button_reply.title', () => {
      expect(extractWhatsAppMessageText({ interactive: { button_reply: { title: 'Yes' } } })).toBe(
        'Yes',
      );
    });

    it('falls back to interactive.list_reply.title', () => {
      expect(extractWhatsAppMessageText({ interactive: { list_reply: { title: 'Item 1' } } })).toBe(
        'Item 1',
      );
    });

    it('falls back to caption', () => {
      expect(extractWhatsAppMessageText({ caption: '  pic  ' })).toBe('pic');
    });

    it('returns "[TYPE]" placeholder when no text is available', () => {
      expect(extractWhatsAppMessageText({ type: 'audio' })).toBe('[AUDIO]');
      expect(extractWhatsAppMessageText({ type: 'image' })).toBe('[IMAGE]');
    });

    it('returns empty string when neither text nor a normalisable type is present', () => {
      expect(extractWhatsAppMessageText({})).toBe('');
      expect(extractWhatsAppMessageText(undefined)).toBe('');
    });
  });

  describe('normalizeOutboundStatus', () => {
    it.each([
      ['sent', 'SENT'],
      ['SENT', 'SENT'],
      ['delivered', 'DELIVERED'],
      ['read', 'READ'],
      ['failed', 'FAILED'],
    ] as const)('maps %s → %s', (input, expected) => {
      expect(normalizeOutboundStatus(input)).toBe(expected);
    });

    it('falls back to DELIVERED for unknown / missing values', () => {
      expect(normalizeOutboundStatus(undefined)).toBe('DELIVERED');
      expect(normalizeOutboundStatus('queued')).toBe('DELIVERED');
      expect(normalizeOutboundStatus(null)).toBe('DELIVERED');
      expect(normalizeOutboundStatus({})).toBe('DELIVERED');
    });
  });

  describe('extractFirstStatusErrorCode', () => {
    it('returns null when errors is missing or empty', () => {
      expect(extractFirstStatusErrorCode(undefined)).toBeNull();
      expect(extractFirstStatusErrorCode([])).toBeNull();
    });

    it('returns null when the first error has no code', () => {
      expect(extractFirstStatusErrorCode([{}])).toBeNull();
    });

    it('returns the trimmed string form of a numeric code', () => {
      expect(extractFirstStatusErrorCode([{ code: 131_026 }])).toBe('131026');
    });

    it('returns the trimmed string form of a string code', () => {
      expect(extractFirstStatusErrorCode([{ code: '  E_404  ' }])).toBe('E_404');
    });

    it('returns null when the code coerces to an empty string', () => {
      expect(extractFirstStatusErrorCode([{ code: '   ' }])).toBeNull();
    });
  });
});
