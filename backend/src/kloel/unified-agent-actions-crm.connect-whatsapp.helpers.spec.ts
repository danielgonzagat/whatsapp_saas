import {
  buildConnectingProviderSettings,
  buildWhatsAppAlreadyConnectedResponse,
  buildWhatsAppConnectSuccessResponse,
  classifyLogEventError,
  isJestTestEnv,
  isPrismaForeignKeyError,
  isWhatsAppAlreadyConnected,
  PRISMA_FOREIGN_KEY_VIOLATION_CODE,
  WHATSAPP_ALREADY_CONNECTED_MESSAGE,
  WHATSAPP_CONNECTION_STATUS_CONNECTED,
  WHATSAPP_CONNECTION_STATUS_CONNECTING,
  WHATSAPP_DEFAULT_PROVIDER,
  WHATSAPP_MANUAL_CONNECT_HINT,
  WHATSAPP_META_OAUTH_START_MESSAGE,
  WHATSAPP_NEXT_STEP_AUTHORIZE,
} from './unified-agent-actions-crm.connect-whatsapp.helpers';

describe('unified-agent-actions-crm.connect-whatsapp.helpers (pure)', () => {
  describe('constants', () => {
    it('export stable PT-BR copy and Prisma error code', () => {
      expect(WHATSAPP_MANUAL_CONNECT_HINT).toMatch(/\/whatsapp/);
      expect(WHATSAPP_META_OAUTH_START_MESSAGE).toMatch(/Meta/);
      expect(WHATSAPP_ALREADY_CONNECTED_MESSAGE).toMatch(/conectado/);
      expect(WHATSAPP_NEXT_STEP_AUTHORIZE).toMatch(/Meta/);
      expect(WHATSAPP_CONNECTION_STATUS_CONNECTED).toBe('connected');
      expect(WHATSAPP_CONNECTION_STATUS_CONNECTING).toBe('connecting');
      expect(WHATSAPP_DEFAULT_PROVIDER).toBe('meta-cloud');
      expect(PRISMA_FOREIGN_KEY_VIOLATION_CODE).toBe('P2003');
    });
  });

  describe('isJestTestEnv', () => {
    it('returns true when JEST_WORKER_ID is set', () => {
      expect(isJestTestEnv({ JEST_WORKER_ID: '1' } as NodeJS.ProcessEnv)).toBe(true);
    });

    it('returns true when NODE_ENV === "test" even without JEST_WORKER_ID', () => {
      expect(isJestTestEnv({ NODE_ENV: 'test' } as NodeJS.ProcessEnv)).toBe(true);
    });

    it('returns false in other envs', () => {
      expect(isJestTestEnv({ NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toBe(false);
      expect(isJestTestEnv({} as NodeJS.ProcessEnv)).toBe(false);
    });
  });

  describe('isPrismaForeignKeyError', () => {
    it('returns true only for the P2003 code', () => {
      expect(isPrismaForeignKeyError({ code: 'P2003' })).toBe(true);
    });

    it('returns false for other codes / shapes', () => {
      expect(isPrismaForeignKeyError({ code: 'P2002' })).toBe(false);
      expect(isPrismaForeignKeyError({ code: 0 })).toBe(false);
      expect(isPrismaForeignKeyError({})).toBe(false);
      expect(isPrismaForeignKeyError(null)).toBe(false);
      expect(isPrismaForeignKeyError(undefined)).toBe(false);
      expect(isPrismaForeignKeyError('P2003')).toBe(false);
      expect(isPrismaForeignKeyError(new Error('boom'))).toBe(false);
    });
  });

  describe('classifyLogEventError', () => {
    it('returns "silent" inside Jest regardless of error shape', () => {
      const env = { JEST_WORKER_ID: '1' } as NodeJS.ProcessEnv;
      expect(classifyLogEventError(new Error('boom'), env)).toBe('silent');
      expect(classifyLogEventError({ code: 'P2003' }, env)).toBe('silent');
    });

    it('returns "debug" for Prisma FK violations outside Jest', () => {
      const env = { NODE_ENV: 'production' } as NodeJS.ProcessEnv;
      expect(classifyLogEventError({ code: 'P2003' }, env)).toBe('debug');
    });

    it('returns "warn" for unrelated errors outside Jest', () => {
      const env = { NODE_ENV: 'production' } as NodeJS.ProcessEnv;
      expect(classifyLogEventError(new Error('boom'), env)).toBe('warn');
      expect(classifyLogEventError({ code: 'P2002' }, env)).toBe('warn');
      expect(classifyLogEventError(null, env)).toBe('warn');
    });
  });

  describe('isWhatsAppAlreadyConnected', () => {
    it('returns true when provider matches and status is connected', () => {
      expect(
        isWhatsAppAlreadyConnected(
          { whatsappProvider: 'meta-cloud', connectionStatus: 'connected' },
          'meta-cloud',
        ),
      ).toBe(true);
    });

    it('returns false on provider mismatch', () => {
      expect(
        isWhatsAppAlreadyConnected(
          { whatsappProvider: 'waha', connectionStatus: 'connected' },
          'meta-cloud',
        ),
      ).toBe(false);
    });

    it('returns false when status is anything other than "connected"', () => {
      expect(
        isWhatsAppAlreadyConnected(
          { whatsappProvider: 'meta-cloud', connectionStatus: 'connecting' },
          'meta-cloud',
        ),
      ).toBe(false);
      expect(
        isWhatsAppAlreadyConnected(
          { whatsappProvider: 'meta-cloud', connectionStatus: undefined },
          'meta-cloud',
        ),
      ).toBe(false);
    });

    it('returns false when settings are missing', () => {
      expect(isWhatsAppAlreadyConnected(null, 'meta-cloud')).toBe(false);
      expect(isWhatsAppAlreadyConnected(undefined, 'meta-cloud')).toBe(false);
      expect(isWhatsAppAlreadyConnected({}, 'meta-cloud')).toBe(false);
    });
  });

  describe('buildConnectingProviderSettings', () => {
    it('layers the connecting flags on top of existing settings', () => {
      const now = new Date('2026-05-28T12:00:00.000Z');
      const result = buildConnectingProviderSettings(
        { aiTone: 'friendly', whatsappProvider: 'old' },
        'meta-cloud',
        now,
      );
      expect(result).toEqual({
        aiTone: 'friendly',
        whatsappProvider: 'meta-cloud',
        connectionStatus: 'connecting',
        connectionInitiatedAt: '2026-05-28T12:00:00.000Z',
      });
    });

    it('defaults to an empty base when current settings are null/undefined', () => {
      const now = new Date('2026-05-28T12:00:00.000Z');
      expect(buildConnectingProviderSettings(null, 'meta-cloud', now)).toEqual({
        whatsappProvider: 'meta-cloud',
        connectionStatus: 'connecting',
        connectionInitiatedAt: '2026-05-28T12:00:00.000Z',
      });
      expect(buildConnectingProviderSettings(undefined, 'waha', now)).toEqual({
        whatsappProvider: 'waha',
        connectionStatus: 'connecting',
        connectionInitiatedAt: '2026-05-28T12:00:00.000Z',
      });
    });

    it('falls back to system time when no Date is passed', () => {
      const before = Date.now();
      const result = buildConnectingProviderSettings({}, 'meta-cloud');
      const after = Date.now();
      const ts = Date.parse(String(result.connectionInitiatedAt));
      expect(ts).toBeGreaterThanOrEqual(before);
      expect(ts).toBeLessThanOrEqual(after);
    });
  });

  describe('buildWhatsAppConnectSuccessResponse', () => {
    it('prefers the provider session message when present', () => {
      const result = buildWhatsAppConnectSuccessResponse({
        sessionSuccess: true,
        sessionMessage: 'Sessão pronta',
        authUrl: 'https://meta/oauth',
        workspaceId: 'ws_1',
        provider: 'meta-cloud',
      });
      expect(result).toEqual({
        success: true,
        message: 'Sessão pronta',
        sessionId: 'ws_1',
        provider: 'meta-cloud',
        authUrl: 'https://meta/oauth',
        nextStep: WHATSAPP_NEXT_STEP_AUTHORIZE,
      });
    });

    it('falls back to the canonical PT-BR message when provider omits one', () => {
      const result = buildWhatsAppConnectSuccessResponse({
        sessionSuccess: false,
        workspaceId: 'ws_2',
        provider: 'meta-cloud',
      });
      expect(result.message).toBe(WHATSAPP_META_OAUTH_START_MESSAGE);
      expect(result.success).toBe(false);
      expect(result.authUrl).toBeUndefined();
    });

    it('normalizes a null authUrl to undefined', () => {
      const result = buildWhatsAppConnectSuccessResponse({
        sessionSuccess: true,
        workspaceId: 'ws_3',
        provider: 'meta-cloud',
        authUrl: null,
      });
      expect(result.authUrl).toBeUndefined();
    });
  });

  describe('buildWhatsAppAlreadyConnectedResponse', () => {
    it('produces the deduplicated payload', () => {
      const result = buildWhatsAppAlreadyConnectedResponse('ws_42', 'meta-cloud');
      expect(result).toEqual({
        success: true,
        message: WHATSAPP_ALREADY_CONNECTED_MESSAGE,
        sessionId: 'ws_42',
        provider: 'meta-cloud',
        deduplicated: true,
      });
    });
  });
});
