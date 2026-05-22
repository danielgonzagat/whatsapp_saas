import { TikTokMarketingModeService } from './tiktok-marketing-mode.service';

const OLD_ENV = { ...process.env };

function setEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

describe('TikTokMarketingModeService', () => {
  const messageCount = jest.fn();
  const kloelSaleCount = jest.fn();
  const prisma = {
    message: { count: messageCount },
    kloelSale: { count: kloelSaleCount },
  };
  const service = new TikTokMarketingModeService(prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
    messageCount.mockResolvedValue(0);
    kloelSaleCount.mockResolvedValue(0);
  });

  afterEach(() => {
    process.env = { ...OLD_ENV };
  });

  describe('blocked mode', () => {
    it('returns blocked when TIKTOK_CLIENT_KEY is missing', async () => {
      setEnv('TIKTOK_CLIENT_KEY', undefined);
      setEnv('NEXT_PUBLIC_TIKTOK_CLIENT_KEY', undefined);
      setEnv('TIKTOK_CLIENT_SECRET', 'sec');

      const result = await service.resolveMode('ws_1');

      expect(result.mode).toBe('blocked');
      expect(result.details.clientConfigured).toBe(false);
      expect(result.details.secretConfigured).toBe(true);
      expect(result.details.missingVariables).toContain('TIKTOK_CLIENT_KEY');
      expect(result.details.requiredSteps.length).toBeGreaterThan(0);
    });

    it('returns blocked when TIKTOK_CLIENT_SECRET is missing', async () => {
      setEnv('TIKTOK_CLIENT_KEY', 'ck');
      setEnv('TIKTOK_CLIENT_SECRET', undefined);

      const result = await service.resolveMode('ws_1');

      expect(result.mode).toBe('blocked');
      expect(result.details.clientConfigured).toBe(true);
      expect(result.details.secretConfigured).toBe(false);
      expect(result.details.missingVariables).toContain('TIKTOK_CLIENT_SECRET');
    });

    it('returns blocked when both keys are missing', async () => {
      setEnv('TIKTOK_CLIENT_KEY', undefined);
      setEnv('NEXT_PUBLIC_TIKTOK_CLIENT_KEY', undefined);
      setEnv('TIKTOK_CLIENT_SECRET', undefined);

      const result = await service.resolveMode('ws_1');

      expect(result.mode).toBe('blocked');
      expect(result.details.missingVariables).toContain('TIKTOK_CLIENT_KEY');
      expect(result.details.missingVariables).toContain('TIKTOK_CLIENT_SECRET');
    });

    it('returns blocked when token is expired/revoked', async () => {
      setEnv('TIKTOK_CLIENT_KEY', 'ck');
      setEnv('TIKTOK_CLIENT_SECRET', 'sec');
      setEnv('TIKTOK_OUTBOUND_APPROVED', 'true');

      const result = await service.resolveMode('ws_1', true);

      expect(result.mode).toBe('blocked');
      expect(result.details.tokenValid).toBe(false);
      expect(
        result.details.requiredSteps.some((s) => s.includes('expirado') || s.includes('revogado')),
      ).toBe(true);
    });

    it('returns blocked when client key is present only via NEXT_PUBLIC_ fallback', async () => {
      setEnv('TIKTOK_CLIENT_KEY', undefined);
      setEnv('NEXT_PUBLIC_TIKTOK_CLIENT_KEY', 'fallback_key');
      setEnv('TIKTOK_CLIENT_SECRET', undefined);

      const result = await service.resolveMode('ws_1');

      expect(result.mode).toBe('blocked');
      expect(result.details.clientConfigured).toBe(true);
      expect(result.details.secretConfigured).toBe(false);
    });
  });

  describe('listen mode', () => {
    it('returns listen when outbound is not approved', async () => {
      setEnv('TIKTOK_CLIENT_KEY', 'ck');
      setEnv('TIKTOK_CLIENT_SECRET', 'sec');
      setEnv('TIKTOK_OUTBOUND_APPROVED', 'false');

      const result = await service.resolveMode('ws_1');

      expect(result.mode).toBe('listen');
      expect(result.details.outboundApproved).toBe(false);
      expect(result.details.missingVariables).toContain('TIKTOK_OUTBOUND_APPROVED');
      expect(result.details.tokenValid).toBe(true);
      expect(result.details.requiredSteps.some((s) => s.includes('ainda nao foi aprovado'))).toBe(
        true,
      );
    });

    it('returns listen when outbound is approved but no recent outbound activity', async () => {
      setEnv('TIKTOK_CLIENT_KEY', 'ck');
      setEnv('TIKTOK_CLIENT_SECRET', 'sec');
      setEnv('TIKTOK_OUTBOUND_APPROVED', 'true');
      messageCount.mockResolvedValue(0);
      kloelSaleCount.mockResolvedValue(0);

      const result = await service.resolveMode('ws_1');

      expect(result.mode).toBe('listen');
      expect(result.details.outboundApproved).toBe(true);
      expect(result.details.tokenValid).toBe(true);
      expect(result.details.recentOutbound).toBe(false);
      expect(result.details.requiredSteps.some((s) => s.includes('Nenhum envio'))).toBe(true);
    });

    it('returns listen when TIKTOK_OUTBOUND_APPROVED is not set at all', async () => {
      setEnv('TIKTOK_CLIENT_KEY', 'ck');
      setEnv('TIKTOK_CLIENT_SECRET', 'sec');
      setEnv('TIKTOK_OUTBOUND_APPROVED', undefined);

      const result = await service.resolveMode('ws_1');

      expect(result.mode).toBe('listen');
      expect(result.details.outboundApproved).toBe(false);
    });

    it('returns listen when outbound approved but only recent INBOUND messages exist', async () => {
      setEnv('TIKTOK_CLIENT_KEY', 'ck');
      setEnv('TIKTOK_CLIENT_SECRET', 'sec');
      setEnv('TIKTOK_OUTBOUND_APPROVED', 'true');
      messageCount.mockResolvedValue(0);
      kloelSaleCount.mockResolvedValue(0);

      const result = await service.resolveMode('ws_1');

      expect(result.mode).toBe('listen');
    });
  });

  describe('sell mode', () => {
    it('returns sell when keys present, outbound approved, and recent outbound exists', async () => {
      setEnv('TIKTOK_CLIENT_KEY', 'ck');
      setEnv('TIKTOK_CLIENT_SECRET', 'sec');
      setEnv('TIKTOK_OUTBOUND_APPROVED', 'true');
      messageCount.mockResolvedValue(3);

      const result = await service.resolveMode('ws_1');

      expect(result.mode).toBe('sell');
      expect(result.details.recentOutbound).toBe(true);
      expect(result.details.tokenValid).toBe(true);
      expect(messageCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            workspaceId: 'ws_1',
            direction: 'OUTBOUND',
            status: { in: ['SENT', 'DELIVERED', 'READ'] },
            createdAt: expect.objectContaining({
              gte: messageCount.mock.calls[0][0].where.createdAt.gte,
            }),
            conversation: { channel: 'TIKTOK' },
          }),
        }),
      );
      expect(messageCount.mock.calls[0][0].where.createdAt.gte).toBeInstanceOf(Date);
    });

    it('stays in listen when only paid sales exist but no TikTok outbound message — sales alone are not TikTok-scoped', async () => {
      setEnv('TIKTOK_CLIENT_KEY', 'ck');
      setEnv('TIKTOK_CLIENT_SECRET', 'sec');
      setEnv('TIKTOK_OUTBOUND_APPROVED', 'true');
      messageCount.mockResolvedValue(0);
      kloelSaleCount.mockResolvedValue(2);

      const result = await service.resolveMode('ws_1');

      expect(result.mode).toBe('listen');
      expect(result.details.recentOutbound).toBe(false);
    });

    it('uses NEXT_PUBLIC_TIKTOK_CLIENT_KEY as fallback for client key', async () => {
      setEnv('TIKTOK_CLIENT_KEY', undefined);
      setEnv('NEXT_PUBLIC_TIKTOK_CLIENT_KEY', 'fallback_ck');
      setEnv('TIKTOK_CLIENT_SECRET', 'sec');
      setEnv('TIKTOK_OUTBOUND_APPROVED', 'true');
      messageCount.mockResolvedValue(1);

      const result = await service.resolveMode('ws_1');

      expect(result.mode).toBe('sell');
      expect(result.details.clientConfigured).toBe(true);
    });
  });

  describe('mode decision tree', () => {
    it('follows the deterministic order: blocked > listen (no outbound approval) > listen (no activity) > sell', async () => {
      setEnv('TIKTOK_CLIENT_KEY', 'ck');
      setEnv('TIKTOK_CLIENT_SECRET', 'sec');
      setEnv('TIKTOK_OUTBOUND_APPROVED', 'true');
      messageCount.mockResolvedValue(5);
      kloelSaleCount.mockResolvedValue(1);

      const result = await service.resolveMode('ws_1');

      expect(result.mode).toBe('sell');
      expect(result.details.missingVariables).toEqual([]);
      expect(result.details.requiredSteps).toEqual([]);
    });

    it('has empty missingVariables and requiredSteps when fully configured and selling', async () => {
      setEnv('TIKTOK_CLIENT_KEY', 'ck');
      setEnv('TIKTOK_CLIENT_SECRET', 'sec');
      setEnv('TIKTOK_OUTBOUND_APPROVED', 'true');
      messageCount.mockResolvedValue(1);

      const result = await service.resolveMode('ws_1');

      expect(result.details.missingVariables).toEqual([]);
    });
  });
});
