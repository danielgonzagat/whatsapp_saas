import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const {
  mockProviderSendText,
  mockProviderSendMedia,
  mockFallbackSendText,
  mockFallbackSendMedia,
  mockCheckSubscriptionStatus,
  mockCheckMessageLimit,
  mockApply,
  mockPushAlert,
  mockRedisSet,
  mockRedisGet,
  mockRedisDel,
} = vi.hoisted(() => ({
  mockProviderSendText: vi.fn(),
  mockProviderSendMedia: vi.fn(),
  mockFallbackSendText: vi.fn(),
  mockFallbackSendMedia: vi.fn(),
  mockCheckSubscriptionStatus: vi.fn(),
  mockCheckMessageLimit: vi.fn(),
  mockApply: vi.fn(),
  mockPushAlert: vi.fn(),
  mockRedisSet: vi.fn(),
  mockRedisGet: vi.fn(),
  mockRedisDel: vi.fn(),
}));

vi.mock('../providers/whatsapp-api-provider', () => ({
  whatsappApiProvider: {
    sendText: mockProviderSendText,
    sendMedia: mockProviderSendMedia,
  },
}));

vi.mock('../providers/auto-provider', () => ({
  autoProvider: {
    sendText: mockFallbackSendText,
    sendMedia: mockFallbackSendMedia,
  },
}));

vi.mock('../providers/plan-limits', () => ({
  PlanLimitsProvider: {
    checkSubscriptionStatus: mockCheckSubscriptionStatus,
    checkMessageLimit: mockCheckMessageLimit,
  },
}));

vi.mock('../providers/anti-ban', () => ({
  AntiBan: {
    apply: mockApply,
  },
}));

vi.mock('../providers/health-monitor', () => ({
  HealthMonitor: {
    pushAlert: mockPushAlert,
  },
}));

vi.mock('../redis-client', () => ({
  redis: {
    set: mockRedisSet,
    get: mockRedisGet,
    del: mockRedisDel,
  },
  redisSub: {},
  redisPub: {},
}));

import { WhatsAppEngine } from '../providers/whatsapp-engine';

describe('WhatsAppEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckSubscriptionStatus.mockResolvedValue({ active: true });
    mockCheckMessageLimit.mockResolvedValue({ allowed: true });
    mockApply.mockResolvedValue(undefined);
    mockPushAlert.mockResolvedValue(undefined);
  });

  it('falls back when WAHA provider returns an error payload instead of success', async () => {
    mockProviderSendText.mockResolvedValue({ error: 'waha_send_failed' });
    mockFallbackSendText.mockResolvedValue({ success: true, id: 'fallback-1' });

    const result = await WhatsAppEngine.sendText({ id: 'ws-1' }, '5511999999999', 'Oi');

    expect(mockFallbackSendText).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ success: true, id: 'fallback-1' });
  });

  it('passes quotedMessageId through the WAHA text path', async () => {
    mockProviderSendText.mockResolvedValue({ success: true, id: 'provider-1' });

    await WhatsAppEngine.sendText({ id: 'ws-1' }, '5511999999999', 'Oi', {
      quotedMessageId: 'msg-quoted-1',
    });

    expect(mockProviderSendText).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'ws-1' }),
      '5511999999999',
      'Oi',
      { quotedMessageId: 'msg-quoted-1' },
    );
  });

  it('passes the real WAHA chatId through the WAHA text path', async () => {
    mockProviderSendText.mockResolvedValue({ success: true, id: 'provider-2' });

    await WhatsAppEngine.sendText({ id: 'ws-1' }, '5511999999999', 'Oi', {
      chatId: '123456789@lid',
    });

    expect(mockProviderSendText).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'ws-1' }),
      '5511999999999',
      'Oi',
      { chatId: '123456789@lid' },
    );
  });

  describe('withWorkspaceActionLock — invariant I6 (lock semantics)', () => {
    beforeEach(() => {
      // Force the lock path to execute even in test mode
      process.env.WHATSAPP_ACTION_LOCK_TEST_ENFORCE = 'true';
      process.env.WHATSAPP_ACTION_LOCK_MS = '500';
      mockRedisSet.mockReset();
      mockRedisGet.mockReset();
      mockRedisDel.mockReset();
      mockRedisGet.mockResolvedValue(null);
      mockRedisDel.mockResolvedValue(1);
      // Reset send mocks to defaults; clearAllMocks does not clear implementations
      mockProviderSendText.mockReset();
      mockProviderSendMedia.mockReset();
      mockFallbackSendText.mockReset();
      mockFallbackSendMedia.mockReset();
      mockProviderSendText.mockResolvedValue({ success: true, id: 'ok' });
      // Default fallback to also throw so lock-release tests do not get masked
      mockFallbackSendText.mockRejectedValue(new Error('fallback_not_configured_in_lock_test'));
    });

    afterEach(() => {
      delete process.env.WHATSAPP_ACTION_LOCK_TEST_ENFORCE;
      delete process.env.WHATSAPP_ACTION_LOCK_MS;
    });

    it('acquires the lock and executes the operation when redis SET NX returns OK', async () => {
      mockRedisSet.mockResolvedValue('OK');

      const result = await WhatsAppEngine.sendText({ id: 'ws-lock-1' }, '5511999999999', 'Oi');

      expect(mockRedisSet).toHaveBeenCalledWith(
        expect.stringMatching(/^whatsapp:action-lock:ws-lock-1$/),
        expect.any(String),
        'PX',
        expect.any(Number),
        'NX',
      );
      expect(mockProviderSendText).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ success: true, id: 'ok' });
    });

    it('throws instead of running unprotected when the lock deadline expires', async () => {
      // Redis SET NX always returns null — lock never acquired
      mockRedisSet.mockResolvedValue(null);

      await expect(
        WhatsAppEngine.sendText({ id: 'ws-lock-2' }, '5511999999999', 'Oi'),
      ).rejects.toThrow(/Failed to acquire workspace action lock/i);

      // The operation must NOT have executed
      expect(mockProviderSendText).not.toHaveBeenCalled();
    });

    it('releases the lock after a successful operation', async () => {
      mockRedisSet.mockResolvedValue('OK');
      // Simulate redis.get returning the same token that was set
      let storedToken: string | undefined;
      mockRedisSet.mockImplementation(async (_key: string, token: string) => {
        storedToken = token;
        return 'OK';
      });
      mockRedisGet.mockImplementation(async () => storedToken || null);

      await WhatsAppEngine.sendText({ id: 'ws-lock-3' }, '5511999999999', 'Oi');

      expect(mockRedisDel).toHaveBeenCalledWith(
        expect.stringMatching(/^whatsapp:action-lock:ws-lock-3$/),
      );
    });

    it('releases the lock even if the operation throws', async () => {
      let storedToken: string | undefined;
      mockRedisSet.mockImplementation(async (_key: string, token: string) => {
        storedToken = token;
        return 'OK';
      });
      mockRedisGet.mockImplementation(async () => storedToken || null);
      // Trigger a throw that propagates through the operation callback.
      // checkSubscriptionStatus runs before the try/catch in sendText,
      // so its throw is visible to the lock's finally block.
      mockCheckSubscriptionStatus.mockResolvedValueOnce({
        active: false,
        reason: 'boom',
      });

      await expect(
        WhatsAppEngine.sendText({ id: 'ws-lock-4' }, '5511999999999', 'Oi'),
      ).rejects.toThrow('boom');

      expect(mockRedisDel).toHaveBeenCalledWith(
        expect.stringMatching(/^whatsapp:action-lock:ws-lock-4$/),
      );
    });
  });
});
