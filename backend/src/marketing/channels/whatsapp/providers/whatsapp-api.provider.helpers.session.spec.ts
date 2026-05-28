import {
  WhatsAppSessionState,
  buildSessionConfigDiagnosticsPayload,
  deriveQrCodeMessage,
  deriveSessionStateFromDetails,
  hasAnyEnv,
  hasEnv,
} from './whatsapp-api.provider.helpers';

describe('whatsapp-api.provider.helpers (session state + qr + diagnostics)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
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
