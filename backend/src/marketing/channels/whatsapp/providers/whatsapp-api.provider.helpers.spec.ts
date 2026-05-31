import {
  buildEnvBackedSessionOverview,
  buildRuntimeConfigDiagnostics,
  hasAnyEnv,
  hasEnv,
} from './whatsapp-api.provider.helpers';

describe('whatsapp-api.provider.helpers (env + runtime config)', () => {
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
});
