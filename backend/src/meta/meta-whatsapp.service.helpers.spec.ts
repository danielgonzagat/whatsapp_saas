import {
  buildDiscoveryFallback,
  buildMarkAsReadPayload,
  buildPhoneNumberDetailsFromGraphResponse,
  buildResolvedMetaConnection,
  buildSendMediaMessagePayload,
  buildSendTextMessagePayload,
  computeMetaTokenExpired,
  extractDiscoveredWhatsAppAssets,
  isMatchingEnvPhoneNumberId,
} from './meta-whatsapp.service.helpers';

describe('meta-whatsapp.service.helpers', () => {
  describe('computeMetaTokenExpired', () => {
    it('returns false for null/undefined expiry', () => {
      expect(computeMetaTokenExpired(null)).toBe(false);
      expect(computeMetaTokenExpired(undefined)).toBe(false);
    });

    it('returns false for unparseable date strings', () => {
      expect(computeMetaTokenExpired('not-a-date')).toBe(false);
    });

    it('returns true when expiry is strictly before now', () => {
      const now = new Date('2026-01-01T00:00:00Z').getTime();
      const expiresAt = new Date('2025-12-31T23:59:59Z');
      expect(computeMetaTokenExpired(expiresAt, now)).toBe(true);
    });

    it('returns false when expiry equals or exceeds now', () => {
      const now = new Date('2026-01-01T00:00:00Z').getTime();
      expect(computeMetaTokenExpired(new Date(now), now)).toBe(false);
      expect(computeMetaTokenExpired(new Date(now + 1000), now)).toBe(false);
    });

    it('accepts ISO string expiry equivalently to Date', () => {
      const now = new Date('2026-01-01T00:00:00Z').getTime();
      expect(computeMetaTokenExpired('2025-12-31T00:00:00Z', now)).toBe(true);
      expect(computeMetaTokenExpired('2030-01-01T00:00:00Z', now)).toBe(false);
    });
  });

  describe('buildResolvedMetaConnection', () => {
    it('builds a connection from a populated DB row with persistedConnection=true', () => {
      const result = buildResolvedMetaConnection({
        workspaceId: 'ws-1',
        channelSession: {
          accessToken: 'plain-token',
          tokenExpiresAt: null,
          pageId: 'page-1',
          pageName: 'KLOEL Page',
          pageAccessToken: 'plain-page-token',
          instagramAccountId: 'ig-1',
          instagramUsername: 'kloel_ig',
          whatsappPhoneNumberId: 'pnid-1',
          whatsappBusinessId: 'waba-1',
          adAccountId: 'act_99',
        },
        env: {},
      });
      expect(result).toEqual({
        workspaceId: 'ws-1',
        accessToken: 'plain-token',
        phoneNumberId: 'pnid-1',
        whatsappBusinessId: 'waba-1',
        pageId: 'page-1',
        pageName: 'KLOEL Page',
        pageAccessToken: 'plain-page-token',
        instagramAccountId: 'ig-1',
        instagramUsername: 'kloel_ig',
        adAccountId: 'act_99',
        tokenExpired: false,
        persistedConnection: true,
      });
    });

    it('falls back to env vars when DB row missing and reports persistedConnection=false', () => {
      const result = buildResolvedMetaConnection({
        workspaceId: 'ws-2',
        channelSession: null,
        env: {
          META_ACCESS_TOKEN: '  env-token  ',
          META_PHONE_NUMBER_ID: 'env-pnid',
          META_WABA_ID: 'env-waba',
        },
      });
      expect(result.workspaceId).toBe('ws-2');
      expect(result.accessToken).toBe('env-token');
      expect(result.phoneNumberId).toBe('env-pnid');
      expect(result.whatsappBusinessId).toBe('env-waba');
      expect(result.persistedConnection).toBe(false);
      expect(result.pageId).toBeNull();
      expect(result.pageAccessToken).toBeNull();
      expect(result.tokenExpired).toBe(false);
    });

    it('flags tokenExpired when DB tokenExpiresAt is past now', () => {
      const now = new Date('2026-05-28T00:00:00Z').getTime();
      const result = buildResolvedMetaConnection({
        workspaceId: 'ws-3',
        channelSession: {
          accessToken: 'still-valid-looking',
          tokenExpiresAt: new Date('2026-05-01T00:00:00Z'),
        },
        env: {},
        now,
      });
      expect(result.tokenExpired).toBe(true);
    });

    it('coerces empty whatsappBusinessId to null', () => {
      const result = buildResolvedMetaConnection({
        workspaceId: 'ws-4',
        channelSession: { whatsappBusinessId: '   ' },
        env: {},
      });
      expect(result.whatsappBusinessId).toBeNull();
    });
  });

  describe('buildSendTextMessagePayload', () => {
    it('builds the canonical Meta text payload with trimmed digits', () => {
      const payload = buildSendTextMessagePayload({
        to: '+55 (11) 91234-5678',
        message: 'Olá, mundo!',
      });
      expect(payload).toEqual({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: '5511912345678',
        type: 'text',
        text: { body: 'Olá, mundo!', preview_url: false },
      });
    });

    it('includes a quoted-message context when quotedMessageId is provided', () => {
      const payload = buildSendTextMessagePayload({
        to: '5511999999999',
        message: 'reply',
        quotedMessageId: '  wamid.HBg= ',
      });
      expect(payload.context).toEqual({ message_id: 'wamid.HBg=' });
    });

    it('omits the context key when quotedMessageId is null/undefined/empty', () => {
      const a = buildSendTextMessagePayload({ to: '5511', message: 'a' });
      const b = buildSendTextMessagePayload({ to: '5511', message: 'b', quotedMessageId: null });
      const c = buildSendTextMessagePayload({ to: '5511', message: 'c', quotedMessageId: '' });
      expect(a).not.toHaveProperty('context');
      expect(b).not.toHaveProperty('context');
      expect(c).not.toHaveProperty('context');
    });

    it('defaults empty body to a space so Meta never rejects an empty text', () => {
      const payload = buildSendTextMessagePayload({ to: '5511', message: '   ' });
      expect((payload.text as { body: string }).body).toBe(' ');
    });
  });

  describe('buildSendMediaMessagePayload', () => {
    it('builds an image payload with caption under the media key', () => {
      const payload = buildSendMediaMessagePayload({
        to: '5511999999999',
        type: 'image',
        mediaUrl: 'https://cdn.kloel.com/x.jpg',
        caption: 'look',
      });
      expect(payload).toEqual({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: '5511999999999',
        type: 'image',
        image: { link: 'https://cdn.kloel.com/x.jpg', caption: 'look' },
      });
    });

    it('does not attach a caption to audio messages even if one is passed', () => {
      const payload = buildSendMediaMessagePayload({
        to: '5511',
        type: 'audio',
        mediaUrl: 'https://cdn.kloel.com/a.mp3',
        caption: 'should-be-dropped',
      });
      expect(payload.audio).toEqual({ link: 'https://cdn.kloel.com/a.mp3' });
    });

    it('includes the quoted-message context when quotedMessageId is provided', () => {
      const payload = buildSendMediaMessagePayload({
        to: '5511',
        type: 'document',
        mediaUrl: 'https://x',
        quotedMessageId: 'wamid.QQ==',
      });
      expect(payload.context).toEqual({ message_id: 'wamid.QQ==' });
    });
  });

  describe('buildMarkAsReadPayload', () => {
    it('produces the static read-receipt payload', () => {
      expect(buildMarkAsReadPayload('wamid.HBg=')).toEqual({
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: 'wamid.HBg=',
      });
    });
  });

  describe('buildDiscoveryFallback', () => {
    it('returns an empty-fallback shape when no env vars are set', () => {
      expect(buildDiscoveryFallback({})).toEqual({
        whatsappBusinessId: null,
        whatsappPhoneNumberId: null,
        displayPhoneNumber: null,
        verifiedName: null,
      });
    });

    it('trims and lifts non-empty env vars', () => {
      expect(
        buildDiscoveryFallback({
          META_WABA_ID: '  waba-99 ',
          META_PHONE_NUMBER_ID: 'pnid-99',
        }),
      ).toEqual({
        whatsappBusinessId: 'waba-99',
        whatsappPhoneNumberId: 'pnid-99',
        displayPhoneNumber: null,
        verifiedName: null,
      });
    });
  });

  describe('extractDiscoveredWhatsAppAssets', () => {
    const fallback = {
      whatsappBusinessId: 'env-waba',
      whatsappPhoneNumberId: 'env-pnid',
      displayPhoneNumber: null,
      verifiedName: null,
    };

    it('parses a fully-populated me/businesses response', () => {
      const response = {
        data: [
          {
            id: 'biz-1',
            owned_whatsapp_business_accounts: [
              {
                id: 'waba-abc',
                phone_numbers: [
                  {
                    id: 'pnid-abc',
                    display_phone_number: '+55 11 91234-5678',
                    verified_name: 'KLOEL',
                  },
                ],
              },
            ],
          },
        ],
      };
      expect(extractDiscoveredWhatsAppAssets(response, fallback)).toEqual({
        whatsappBusinessId: 'waba-abc',
        whatsappPhoneNumberId: 'pnid-abc',
        displayPhoneNumber: '+55 11 91234-5678',
        verifiedName: 'KLOEL',
      });
    });

    it('falls back when Graph response lacks ids', () => {
      const response = { data: [{ owned_whatsapp_business_accounts: [] }] };
      expect(extractDiscoveredWhatsAppAssets(response, fallback)).toEqual({
        whatsappBusinessId: 'env-waba',
        whatsappPhoneNumberId: 'env-pnid',
        displayPhoneNumber: null,
        verifiedName: null,
      });
    });

    it('treats malformed (non-string) verified_name as null', () => {
      const response = {
        data: [
          {
            owned_whatsapp_business_accounts: [
              {
                id: 'waba-1',
                phone_numbers: [
                  {
                    id: 'pnid-1',
                    display_phone_number: { broken: true },
                    verified_name: { broken: true },
                  },
                ],
              },
            ],
          },
        ],
      };
      const out = extractDiscoveredWhatsAppAssets(response, fallback);
      expect(out.displayPhoneNumber).toBeNull();
      expect(out.verifiedName).toBeNull();
      expect(out.whatsappBusinessId).toBe('waba-1');
      expect(out.whatsappPhoneNumberId).toBe('pnid-1');
    });

    it('returns the fallback when given a non-object response', () => {
      expect(extractDiscoveredWhatsAppAssets(null, fallback)).toEqual(fallback);
      expect(extractDiscoveredWhatsAppAssets('garbage', fallback)).toEqual(fallback);
    });
  });

  describe('buildPhoneNumberDetailsFromGraphResponse', () => {
    it('returns parsed display phone + selfIds for a well-formed response', () => {
      const out = buildPhoneNumberDetailsFromGraphResponse(
        {
          display_phone_number: '+55 11 91234-5678',
          verified_name: 'KLOEL',
        },
        null,
      );
      expect(out).toEqual({
        displayPhoneNumber: '+55 11 91234-5678',
        verifiedName: 'KLOEL',
        selfIds: ['5511912345678@c.us', '5511912345678@s.whatsapp.net'],
      });
    });

    it('falls back to pageNameFallback when verified_name is malformed', () => {
      const out = buildPhoneNumberDetailsFromGraphResponse(
        {
          display_phone_number: '+55 11 90000-0000',
          verified_name: { broken: true },
        },
        'Pagina Teste',
      );
      expect(out.verifiedName).toBe('Pagina Teste');
    });

    it('returns empty selfIds when no display_phone_number is parseable', () => {
      const out = buildPhoneNumberDetailsFromGraphResponse(
        { display_phone_number: { broken: true } },
        null,
      );
      expect(out.displayPhoneNumber).toBeNull();
      expect(out.selfIds).toEqual([]);
    });
  });

  describe('isMatchingEnvPhoneNumberId', () => {
    it('returns true when env value (trimmed) equals candidate (trimmed)', () => {
      expect(isMatchingEnvPhoneNumberId('pnid-1', '  pnid-1 ')).toBe(true);
    });

    it('returns false on empty candidate or empty env', () => {
      expect(isMatchingEnvPhoneNumberId('', 'pnid-1')).toBe(false);
      expect(isMatchingEnvPhoneNumberId('pnid-1', '')).toBe(false);
      expect(isMatchingEnvPhoneNumberId('pnid-1', null)).toBe(false);
      expect(isMatchingEnvPhoneNumberId('pnid-1', undefined)).toBe(false);
    });

    it('returns false when env differs from candidate', () => {
      expect(isMatchingEnvPhoneNumberId('pnid-1', 'pnid-2')).toBe(false);
    });
  });
});
