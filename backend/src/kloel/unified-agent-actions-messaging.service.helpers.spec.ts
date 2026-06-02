import {
  buildWhatsAppSendOptions,
  coerceStr,
  escapeHtml,
  isRecord,
  readOptionalText,
  readText,
  resolveChannel,
  resolveComplianceMode,
} from './unified-agent-actions-messaging.service.helpers';
describe('unified-agent-actions-messaging.service.helpers', () => {
  describe('isRecord', () => {
    it('returns true for plain objects', () => {
      expect(isRecord({})).toBe(true);
      expect(isRecord({ foo: 1 })).toBe(true);
    });
    it('returns false for null / scalars', () => {
      expect(isRecord(null)).toBe(false);
      expect(isRecord(undefined)).toBe(false);
      expect(isRecord('x')).toBe(false);
      expect(isRecord(1)).toBe(false);
    });
    it('returns true for arrays (typeof object)', () => {
      // matches historic behaviour from the messaging service
      expect(isRecord([])).toBe(true);
    });
  });

  describe('readText', () => {
    it('passes strings through', () => {
      expect(readText('hello')).toBe('hello');
    });
    it('coerces number / boolean / bigint', () => {
      expect(readText(42)).toBe('42');
      expect(readText(true)).toBe('true');
      expect(readText(BigInt(7))).toBe('7');
    });
    it('returns fallback for null / undefined / object', () => {
      expect(readText(null)).toBe('');
      expect(readText(undefined, 'fb')).toBe('fb');
      expect(readText({})).toBe('');
    });
  });

  describe('readOptionalText', () => {
    it('returns undefined for blank strings', () => {
      expect(readOptionalText('   ')).toBeUndefined();
      expect(readOptionalText('')).toBeUndefined();
      expect(readOptionalText(undefined)).toBeUndefined();
    });
    it('trims whitespace', () => {
      expect(readOptionalText('  hi  ')).toBe('hi');
    });
  });

  describe('coerceStr', () => {
    it('passes strings through', () => {
      expect(coerceStr('a')).toBe('a');
    });
    it('coerces number / boolean (not bigint)', () => {
      expect(coerceStr(0)).toBe('0');
      expect(coerceStr(false)).toBe('false');
    });
    it('returns fallback for non-string/number/boolean', () => {
      expect(coerceStr(undefined, 'x')).toBe('x');
      expect(coerceStr({}, 'x')).toBe('x');
      expect(coerceStr(BigInt(1), 'x')).toBe('x');
    });
  });

  describe('resolveComplianceMode', () => {
    it('is reactive only when deliveryMode is exactly "reactive"', () => {
      expect(resolveComplianceMode({ deliveryMode: 'reactive' })).toBe('reactive');
      expect(resolveComplianceMode({ deliveryMode: 'proactive' })).toBe('proactive');
      expect(resolveComplianceMode({})).toBe('proactive');
      expect(resolveComplianceMode(undefined)).toBe('proactive');
    });
  });

  describe('resolveChannel', () => {
    it('defaults to whatsapp', () => {
      expect(resolveChannel(undefined)).toBe('whatsapp');
      expect(resolveChannel({})).toBe('whatsapp');
      expect(resolveChannel({ channel: 'unknown' })).toBe('whatsapp');
    });
    it('respects whitelisted channels (case-insensitive)', () => {
      expect(resolveChannel({ channel: 'EMAIL' })).toBe('email');
      expect(resolveChannel({ channel: 'Instagram' })).toBe('instagram');
      expect(resolveChannel({ channel: 'messenger' })).toBe('messenger');
      expect(resolveChannel({ channel: 'tiktok' })).toBe('tiktok');
    });
    it('falls back via sourceChannel then provider', () => {
      expect(resolveChannel({ sourceChannel: 'instagram' })).toBe('instagram');
      expect(resolveChannel({ provider: 'email' })).toBe('email');
      expect(resolveChannel({ channel: '', sourceChannel: '', provider: 'tiktok' })).toBe('tiktok');
    });
  });

  describe('buildWhatsAppSendOptions', () => {
    it('returns proactive defaults when no context/extra', () => {
      const opts = buildWhatsAppSendOptions();
      expect(opts.complianceMode).toBe('proactive');
      expect(opts.forceDirect).toBe(false);
      expect(opts.mediaUrl).toBeUndefined();
      expect(opts.mediaType).toBeUndefined();
      expect(opts.caption).toBeUndefined();
      expect(opts.externalId).toBeUndefined();
      expect(opts.quotedMessageId).toBeUndefined();
    });

    it('propagates whitelisted mediaType only', () => {
      expect(buildWhatsAppSendOptions(undefined, { mediaType: 'image' }).mediaType).toBe('image');
      expect(buildWhatsAppSendOptions(undefined, { mediaType: 'bogus' }).mediaType).toBeUndefined();
    });

    it('falls back through quotedMessageId chain', () => {
      expect(
        buildWhatsAppSendOptions({ quotedMessageId: 'ctx-q' }, { quotedMessageId: 'extra-q' })
          .quotedMessageId,
      ).toBe('extra-q');
      expect(buildWhatsAppSendOptions({ quotedMessageId: 'ctx-q' }).quotedMessageId).toBe('ctx-q');
      expect(buildWhatsAppSendOptions({ providerMessageId: 'prov-q' }).quotedMessageId).toBe(
        'prov-q',
      );
    });

    it('honours forceDirect flag and reactive mode', () => {
      const opts = buildWhatsAppSendOptions({ deliveryMode: 'reactive', forceDirect: true });
      expect(opts.complianceMode).toBe('reactive');
      expect(opts.forceDirect).toBe(true);
    });

    it('omits empty / non-string extras', () => {
      const opts = buildWhatsAppSendOptions(undefined, {
        mediaUrl: '',
        caption: '   ',
        externalId: null,
      });
      expect(opts.mediaUrl).toBeUndefined();
      expect(opts.caption).toBeUndefined();
      expect(opts.externalId).toBeUndefined();
    });

    it('tolerates non-record extra arg', () => {
      const opts = buildWhatsAppSendOptions(
        undefined,
        'not-an-object' as unknown as Record<string, unknown>,
      );
      expect(opts.complianceMode).toBe('proactive');
      expect(opts.mediaUrl).toBeUndefined();
    });
  });

  describe('escapeHtml', () => {
    it('escapes the HTML special chars', () => {
      expect(escapeHtml(`<a href="x">'foo' & "bar"</a>`)).toBe(
        '&lt;a href=&quot;x&quot;&gt;&#x27;foo&#x27; &amp; &quot;bar&quot;&lt;/a&gt;',
      );
    });
    it('returns input unchanged when no special chars', () => {
      expect(escapeHtml('plain text')).toBe('plain text');
    });
  });
});
