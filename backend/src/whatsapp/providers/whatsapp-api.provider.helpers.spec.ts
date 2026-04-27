import {
  WhatsAppSessionState,
  hasEnv,
  hasAnyEnv,
  deriveSessionStateFromDetails,
  deriveQrCodeMessage,
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
});
