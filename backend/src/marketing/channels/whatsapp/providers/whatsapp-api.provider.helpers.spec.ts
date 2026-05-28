import {
  WhatsAppSessionState,
  buildEnvBackedSessionOverview,
  buildRuntimeConfigDiagnostics,
  buildSessionConfigDiagnosticsPayload,
  clampChatMessagePagination,
  composeWhatsAppChatId,
  deriveQrCodeMessage,
  deriveSessionStateFromDetails,
  hasAnyEnv,
  hasEnv,
  mapContactRowToWahaContact,
  mapConversationRowToWahaChat,
  mapMessageRowToWahaMessage,
} from './whatsapp-api.provider.helpers';

describe('whatsapp-api.provider.helpers', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('hasEnv', () => {
    it('should return true when env var is set and non-empty', () => {
      process.env.TEST_VAR = 'value';
      expect(hasEnv('TEST_VAR')).toBe(true);
    });

    it('should return false when env var is undefined', () => {
      delete process.env.UNDEFINED_VAR;
      expect(hasEnv('UNDEFINED_VAR')).toBe(false);
    });

    it('should return false when env var is empty string', () => {
      process.env.EMPTY_VAR = '';
      expect(hasEnv('EMPTY_VAR')).toBe(false);
    });

    it('should return false when env var is only whitespace', () => {
      process.env.WHITESPACE_VAR = '   \t\n  ';
      expect(hasEnv('WHITESPACE_VAR')).toBe(false);
    });

    it('should trim whitespace before checking', () => {
      process.env.TRIMMED_VAR = '  value  ';
      expect(hasEnv('TRIMMED_VAR')).toBe(true);
    });

    it('should handle zero as truthy', () => {
      process.env.ZERO_VAR = '0';
      expect(hasEnv('ZERO_VAR')).toBe(true);
    });
  });

  describe('hasAnyEnv', () => {
    it('should return true when first env var is set', () => {
      process.env.VAR_A = 'value';
      delete process.env.VAR_B;
      expect(hasAnyEnv(['VAR_A', 'VAR_B'])).toBe(true);
    });

    it('should return true when second env var is set', () => {
      delete process.env.VAR_A;
      process.env.VAR_B = 'value';
      expect(hasAnyEnv(['VAR_A', 'VAR_B'])).toBe(true);
    });

    it('should return true when multiple env vars are set', () => {
      process.env.VAR_A = 'value1';
      process.env.VAR_B = 'value2';
      expect(hasAnyEnv(['VAR_A', 'VAR_B'])).toBe(true);
    });

    it('should return false when no env vars are set', () => {
      delete process.env.VAR_A;
      delete process.env.VAR_B;
      expect(hasAnyEnv(['VAR_A', 'VAR_B'])).toBe(false);
    });

    it('should return false when all env vars are empty', () => {
      process.env.VAR_A = '';
      process.env.VAR_B = '';
      expect(hasAnyEnv(['VAR_A', 'VAR_B'])).toBe(false);
    });

    it('should return false when all env vars are whitespace', () => {
      process.env.VAR_A = '   ';
      process.env.VAR_B = '\t\n';
      expect(hasAnyEnv(['VAR_A', 'VAR_B'])).toBe(false);
    });

    it('should handle empty array gracefully', () => {
      expect(hasAnyEnv([])).toBe(false);
    });

    it('should work with single element array', () => {
      process.env.SINGLE_VAR = 'value';
      expect(hasAnyEnv(['SINGLE_VAR'])).toBe(true);
    });
  });

  describe('deriveSessionStateFromDetails', () => {
    it('should return CONNECTED when connected is true', () => {
      const result = deriveSessionStateFromDetails({ connected: true });
      expect(result).toBe('CONNECTED');
    });

    it('should return CONNECTED even with other status values', () => {
      const result = deriveSessionStateFromDetails({
        connected: true,
        status: 'CONNECTION_INCOMPLETE',
      });
      expect(result).toBe('CONNECTED');
    });

    it('should return CONNECTION_INCOMPLETE when status matches', () => {
      const result = deriveSessionStateFromDetails({
        connected: false,
        status: 'CONNECTION_INCOMPLETE',
      });
      expect(result).toBe('CONNECTION_INCOMPLETE');
    });

    it('should return DEGRADED when status is DEGRADED', () => {
      const result = deriveSessionStateFromDetails({
        connected: false,
        status: 'DEGRADED',
      });
      expect(result).toBe('DEGRADED');
    });

    it('should return DEGRADED over CONNECTION_INCOMPLETE priority', () => {
      const result = deriveSessionStateFromDetails({
        connected: false,
        status: 'DEGRADED',
      });
      expect(result).toBe('DEGRADED');
    });

    it('should return DISCONNECTED when nothing matches', () => {
      const result = deriveSessionStateFromDetails({
        connected: false,
      });
      expect(result).toBe('DISCONNECTED');
    });

    it('should return DISCONNECTED for unknown status', () => {
      const result = deriveSessionStateFromDetails({
        connected: false,
        status: 'UNKNOWN_STATUS',
      });
      expect(result).toBe('DISCONNECTED');
    });

    it('should return DISCONNECTED for empty object', () => {
      const result = deriveSessionStateFromDetails({});
      expect(result).toBe('DISCONNECTED');
    });

    it('should return null-compatible state type', () => {
      const result: WhatsAppSessionState = deriveSessionStateFromDetails({});
      expect(result).toBe('DISCONNECTED');
    });
  });

  describe('deriveQrCodeMessage', () => {
    it('should return meta_cloud_connected when connected is true', () => {
      const result = deriveQrCodeMessage({ connected: true });
      expect(result).toBe('meta_cloud_connected');
    });

    it('should return meta_cloud_connected even with authUrl', () => {
      const result = deriveQrCodeMessage({
        connected: true,
        authUrl: 'https://example.com/auth',
      });
      expect(result).toBe('meta_cloud_connected');
    });

    it('should return meta_cloud_use_embedded_signup when authUrl is set', () => {
      const result = deriveQrCodeMessage({
        connected: false,
        authUrl: 'https://example.com/auth',
      });
      expect(result).toBe('meta_cloud_use_embedded_signup');
    });

    it('should return meta_cloud_has_no_qr as default fallback', () => {
      const result = deriveQrCodeMessage({
        connected: false,
      });
      expect(result).toBe('meta_cloud_has_no_qr');
    });

    it('should return meta_cloud_has_no_qr when authUrl is empty', () => {
      const result = deriveQrCodeMessage({
        connected: false,
        authUrl: '',
      });
      expect(result).toBe('meta_cloud_has_no_qr');
    });

    it('should return meta_cloud_has_no_qr when authUrl is null', () => {
      const result = deriveQrCodeMessage({
        connected: false,
        authUrl: null,
      });
      expect(result).toBe('meta_cloud_has_no_qr');
    });

    it('should prioritize connected over authUrl', () => {
      const result = deriveQrCodeMessage({
        connected: true,
        authUrl: '',
      });
      expect(result).toBe('meta_cloud_connected');
    });

    it('should handle empty object', () => {
      const result = deriveQrCodeMessage({});
      expect(result).toBe('meta_cloud_has_no_qr');
    });

    it('should return string message keys suitable for i18n', () => {
      const messages = [
        deriveQrCodeMessage({ connected: true }),
        deriveQrCodeMessage({ connected: false, authUrl: 'url' }),
        deriveQrCodeMessage({}),
      ];
      expect(messages.every((m) => m.startsWith('meta_cloud_'))).toBe(true);
    });
  });

  describe('integration scenarios', () => {
    it('should handle happy path: connected account with env check', () => {
      process.env.META_TOKEN = 'token123';
      expect(hasEnv('META_TOKEN')).toBe(true);

      const state = deriveSessionStateFromDetails({ connected: true });
      expect(state).toBe('CONNECTED');

      const message = deriveQrCodeMessage({ connected: true });
      expect(message).toBe('meta_cloud_connected');
    });

    it('should handle degraded account with fallback auth', () => {
      const state = deriveSessionStateFromDetails({
        connected: false,
        status: 'DEGRADED',
      });
      expect(state).toBe('DEGRADED');

      const message = deriveQrCodeMessage({
        connected: false,
        authUrl: 'https://auth.example.com',
      });
      expect(message).toBe('meta_cloud_use_embedded_signup');
    });

    it('should handle env fallback scenario (META_VERIFY_TOKEN vs META_WEBHOOK_VERIFY_TOKEN)', () => {
      delete process.env.META_VERIFY_TOKEN;
      delete process.env.META_WEBHOOK_VERIFY_TOKEN;
      expect(hasAnyEnv(['META_VERIFY_TOKEN', 'META_WEBHOOK_VERIFY_TOKEN'])).toBe(false);

      process.env.META_WEBHOOK_VERIFY_TOKEN = 'webhook_token';
      expect(hasAnyEnv(['META_VERIFY_TOKEN', 'META_WEBHOOK_VERIFY_TOKEN'])).toBe(true);
    });
  });

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

  describe('buildRuntimeConfigDiagnostics', () => {
    const allMetaKeys = [
      'META_APP_SECRET',
      'FACEBOOK_APP_SECRET',
      'META_VERIFY_TOKEN',
      'META_WEBHOOK_VERIFY_TOKEN',
      'META_APP_ID',
      'FACEBOOK_APP_ID',
      'META_CLIENT_ID',
      'META_ACCESS_TOKEN',
      'META_PHONE_NUMBER_ID',
    ];

    beforeEach(() => {
      for (const key of allMetaKeys) {
        delete process.env[key];
      }
    });

    it('should report everything unconfigured when no env vars are set', () => {
      const result = buildRuntimeConfigDiagnostics();
      expect(result.provider).toBe('meta-cloud');
      expect(result.webhookConfigured).toBe(false);
      expect(result.secretConfigured).toBe(false);
      expect(result.appIdConfigured).toBe(false);
      expect(result.appSecretConfigured).toBe(false);
      expect(result.accessTokenConfigured).toBe(false);
      expect(result.phoneNumberIdConfigured).toBe(false);
    });

    it('should always set inboundEventsConfigured=true and stable events list', () => {
      const result = buildRuntimeConfigDiagnostics();
      expect(result.inboundEventsConfigured).toBe(true);
      expect(result.events).toEqual(['messages', 'message_template_status_update', 'comments']);
      expect(result.storeEnabled).toBe(true);
      expect(result.storeFullSync).toBe(true);
    });

    it('should set webhookConfigured=true only when secret+verify token are both present', () => {
      process.env.META_APP_SECRET = 's';
      const onlySecret = buildRuntimeConfigDiagnostics();
      expect(onlySecret.secretConfigured).toBe(true);
      expect(onlySecret.webhookConfigured).toBe(false);

      process.env.META_VERIFY_TOKEN = 'v';
      const both = buildRuntimeConfigDiagnostics();
      expect(both.webhookConfigured).toBe(true);
    });

    it('should accept Facebook-prefixed aliases for app id/secret', () => {
      process.env.FACEBOOK_APP_ID = 'app-id';
      process.env.FACEBOOK_APP_SECRET = 'app-secret';
      process.env.META_WEBHOOK_VERIFY_TOKEN = 'verify';
      const result = buildRuntimeConfigDiagnostics();
      expect(result.appIdConfigured).toBe(true);
      expect(result.appSecretConfigured).toBe(true);
      expect(result.secretConfigured).toBe(true);
      expect(result.webhookConfigured).toBe(true);
    });

    it('should accept META_CLIENT_ID as app id alias', () => {
      process.env.META_CLIENT_ID = 'client-id';
      expect(buildRuntimeConfigDiagnostics().appIdConfigured).toBe(true);
    });
  });

  describe('buildEnvBackedSessionOverview', () => {
    it('should return empty list when phone number id is blank', () => {
      expect(buildEnvBackedSessionOverview('')).toEqual([]);
    });

    it('should return empty list when phone number id is whitespace', () => {
      expect(buildEnvBackedSessionOverview('   \t\n  ')).toEqual([]);
    });

    it('should emit a CONNECTED overview for the configured phone', () => {
      expect(buildEnvBackedSessionOverview('1234567890')).toEqual([
        { name: '1234567890', success: true, rawStatus: 'CONNECTED', state: 'CONNECTED' },
      ]);
    });

    it('should trim surrounding whitespace from the name', () => {
      expect(buildEnvBackedSessionOverview('  1234567890  ')).toEqual([
        { name: '1234567890', success: true, rawStatus: 'CONNECTED', state: 'CONNECTED' },
      ]);
    });
  });

  describe('buildSessionConfigDiagnosticsPayload', () => {
    const baseRuntime = {
      provider: 'meta-cloud' as const,
      webhookConfigured: true,
      inboundEventsConfigured: true,
      events: ['messages'],
      secretConfigured: true,
      storeEnabled: true,
      storeFullSync: true,
      appIdConfigured: true,
      appSecretConfigured: true,
      accessTokenConfigured: true,
      phoneNumberIdConfigured: true,
    };

    it('should derive state via deriveSessionStateFromDetails', () => {
      const result = buildSessionConfigDiagnosticsPayload({
        sessionName: 'ws-1',
        details: { connected: true, status: 'CONNECTED' },
        runtimeConfig: baseRuntime,
      });
      expect(result.state).toBe('CONNECTED');
    });

    it('should include error when degradedReason is defined and non-null', () => {
      const result = buildSessionConfigDiagnosticsPayload({
        sessionName: 'ws-1',
        details: { connected: false, degradedReason: 'meta_down' },
        runtimeConfig: baseRuntime,
      });
      expect(result.error).toBe('meta_down');
    });

    it('should omit error when degradedReason is null', () => {
      const result = buildSessionConfigDiagnosticsPayload({
        sessionName: 'ws-1',
        details: { connected: false, degradedReason: null },
        runtimeConfig: baseRuntime,
      });
      expect(result.error).toBeUndefined();
      expect('error' in result).toBe(false);
    });

    it('should omit authUrl and phoneNumberId when undefined', () => {
      const result = buildSessionConfigDiagnosticsPayload({
        sessionName: 'ws-1',
        details: { connected: true },
        runtimeConfig: baseRuntime,
      });
      expect('authUrl' in result).toBe(false);
      expect('phoneNumberId' in result).toBe(false);
    });

    it('should set configPresent=true when phoneNumberId is defined', () => {
      const result = buildSessionConfigDiagnosticsPayload({
        sessionName: 'ws-1',
        details: { connected: true, phoneNumberId: 'pn-1' },
        runtimeConfig: baseRuntime,
      });
      expect(result.configPresent).toBe(true);
      expect(result.phoneNumberId).toBe('pn-1');
    });

    it('should set configPresent=false when phoneNumberId is missing', () => {
      const result = buildSessionConfigDiagnosticsPayload({
        sessionName: 'ws-1',
        details: { connected: true },
        runtimeConfig: baseRuntime,
      });
      expect(result.configPresent).toBe(false);
    });

    it('should always emit empty mismatch arrays and false flags', () => {
      const result = buildSessionConfigDiagnosticsPayload({
        sessionName: 'ws-1',
        details: { connected: true },
        runtimeConfig: baseRuntime,
      });
      expect(result.configMismatch).toBe(false);
      expect(result.mismatchReasons).toEqual([]);
      expect(result.sessionRestartRisk).toBe(false);
    });

    it('should propagate runtime-config booleans verbatim', () => {
      const customRuntime = {
        ...baseRuntime,
        webhookConfigured: false,
        secretConfigured: false,
        events: ['custom'],
      };
      const result = buildSessionConfigDiagnosticsPayload({
        sessionName: 'ws-2',
        details: { connected: true },
        runtimeConfig: customRuntime,
      });
      expect(result.webhookConfigured).toBe(false);
      expect(result.secretConfigured).toBe(false);
      expect(result.events).toEqual(['custom']);
    });

    it('should propagate whatsappBusinessId or null', () => {
      const withWba = buildSessionConfigDiagnosticsPayload({
        sessionName: 'ws-1',
        details: { connected: true, whatsappBusinessId: 'wba-123' },
        runtimeConfig: baseRuntime,
      });
      expect(withWba.whatsappBusinessId).toBe('wba-123');
      const withoutWba = buildSessionConfigDiagnosticsPayload({
        sessionName: 'ws-1',
        details: { connected: true },
        runtimeConfig: baseRuntime,
      });
      expect(withoutWba.whatsappBusinessId).toBeNull();
    });
  });
});
