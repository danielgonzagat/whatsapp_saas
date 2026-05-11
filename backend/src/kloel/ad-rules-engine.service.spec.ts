import { Test, TestingModule } from '@nestjs/testing';
import { AdRulesEngineService } from './ad-rules-engine.service';
import { PrismaService } from '../prisma/prisma.service';

type AdRuleRecord = {
  id: string;
  workspaceId: string;
  name: string;
  condition: string | null;
  action: string;
  alertMethod: string | null;
  alertTarget: string | null;
  active: boolean;
  fireCount: number;
  lastFiredAt: Date | null;
};

type AdRulesPrismaMock = {
  adRule: {
    findMany: jest.Mock;
    updateMany: jest.Mock;
  };
  kloelSale: {
    count: jest.Mock;
  };
  $transaction: jest.Mock;
};

describe('AdRulesEngineService', () => {
  let service: AdRulesEngineService;
  let prisma: AdRulesPrismaMock;

  const baseRule = (overrides: Partial<AdRuleRecord> = {}): AdRuleRecord => ({
    id: 'rule-1',
    workspaceId: 'ws-1',
    name: 'Alerta de baixa conversao',
    condition: 'roas baixo',
    action: 'notify',
    alertMethod: 'email',
    alertTarget: 'admin@example.com',
    active: true,
    fireCount: 0,
    lastFiredAt: null,
    ...overrides,
  });

  beforeEach(async () => {
    prisma = {
      adRule: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      kloelSale: {
        count: jest.fn().mockResolvedValue(0),
      },
      $transaction: jest.fn().mockResolvedValue(undefined),
    };
    // Manually clear prom-client registry between tests to avoid duplicate metric errors
    const { register } = await import('prom-client');
    register.clear();

    const module: TestingModule = await Test.createTestingModule({
      providers: [AdRulesEngineService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<AdRulesEngineService>(AdRulesEngineService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('happy path', () => {
    it('evaluates active rules and fires those that pass condition check', async () => {
      const rule = baseRule();
      prisma.adRule.findMany.mockResolvedValue([rule]);
      prisma.kloelSale.count.mockResolvedValue(0);

      // Access private method via reflection since evaluateRules uses cron
      await (
        service as unknown as { evaluateRulesWithObservability: () => Promise<void> }
      ).evaluateRulesWithObservability();

      expect(prisma.adRule.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { active: true } }),
      );
      expect(prisma.kloelSale.count).toHaveBeenCalled();
      const calls = prisma.kloelSale.count.mock.calls as Array<
        [{ where: { workspaceId: string; status: string; createdAt: { gte: Date } } }]
      >;
      const countArgs = calls[0][0];
      expect(countArgs.where.workspaceId).toBe('ws-1');
      expect(countArgs.where.status).toBe('paid');
      expect(countArgs.where.createdAt.gte).toBeInstanceOf(Date);
      expect(prisma.adRule.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'rule-1', workspaceId: 'ws-1' },
        }),
      );
    });

    it('returns early when no active rules exist', async () => {
      prisma.adRule.findMany.mockResolvedValue([]);

      await (
        service as unknown as { evaluateRulesWithObservability: () => Promise<void> }
      ).evaluateRulesWithObservability();

      expect(prisma.adRule.updateMany).not.toHaveBeenCalled();
      expect(prisma.kloelSale.count).not.toHaveBeenCalled();
    });
  });

  describe('tenant isolation', () => {
    it('scopes kloelSale count to the rule workspaceId', async () => {
      const rule = baseRule({ workspaceId: 'ws-99', condition: 'roas baixo' });
      prisma.adRule.findMany.mockResolvedValue([rule]);
      prisma.kloelSale.count.mockResolvedValue(0);

      await (
        service as unknown as { evaluateRulesWithObservability: () => Promise<void> }
      ).evaluateRulesWithObservability();

      const tenantCalls = prisma.kloelSale.count.mock.calls as Array<
        [{ where: { workspaceId: string; status: string } }]
      >;
      const tenantCountArgs = tenantCalls[0][0];
      expect(tenantCountArgs.where.workspaceId).toBe('ws-99');
      expect(tenantCountArgs.where.status).toBe('paid');
    });

    it('scopes updateMany to rule workspaceId', async () => {
      const rule = baseRule({ workspaceId: 'ws-42', condition: 'budget' });
      prisma.adRule.findMany.mockResolvedValue([rule]);

      await (
        service as unknown as { evaluateRulesWithObservability: () => Promise<void> }
      ).evaluateRulesWithObservability();

      expect(prisma.adRule.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'rule-1', workspaceId: 'ws-42' },
        }),
      );
    });
  });

  describe('edge cases', () => {
    it('skips rule within cooldown period', async () => {
      const recentFire = new Date(Date.now() - 30 * 60 * 1000);
      const rule = baseRule({ lastFiredAt: recentFire, condition: 'roas alto' });
      prisma.adRule.findMany.mockResolvedValue([rule]);

      await (
        service as unknown as { evaluateRulesWithObservability: () => Promise<void> }
      ).evaluateRulesWithObservability();

      expect(prisma.adRule.updateMany).not.toHaveBeenCalled();
    });

    it('fires rule when cooldown has expired', async () => {
      const oldFire = new Date(Date.now() - 2 * 60 * 60 * 1000);
      const rule = baseRule({ lastFiredAt: oldFire, condition: 'conversao caiu' });
      prisma.adRule.findMany.mockResolvedValue([rule]);
      prisma.kloelSale.count.mockResolvedValue(0);

      await (
        service as unknown as { evaluateRulesWithObservability: () => Promise<void> }
      ).evaluateRulesWithObservability();

      expect(prisma.adRule.updateMany).toHaveBeenCalled();
    });

    it('handles null condition gracefully', async () => {
      const rule = baseRule({ condition: null });
      prisma.adRule.findMany.mockResolvedValue([rule]);

      await (
        service as unknown as { evaluateRulesWithObservability: () => Promise<void> }
      ).evaluateRulesWithObservability();

      expect(prisma.adRule.updateMany).toHaveBeenCalled();
    });
  });

  describe('upstream errors', () => {
    it('logs error and continues when a single rule evaluation fails', async () => {
      const rule1 = baseRule({ id: 'rule-1', condition: 'roas baixo' });
      const rule2 = baseRule({ id: 'rule-2', condition: 'budget' });
      prisma.adRule.findMany.mockResolvedValue([rule1, rule2]);
      prisma.kloelSale.count.mockRejectedValueOnce(new Error('DB down')).mockResolvedValueOnce(5);

      await (
        service as unknown as { evaluateRulesWithObservability: () => Promise<void> }
      ).evaluateRulesWithObservability();

      // rule-2 should still have been evaluated and fired
      const updateCalls = prisma.adRule.updateMany.mock.calls as Array<[{ where: { id: string } }]>;
      expect(updateCalls[0][0].where.id).toBe('rule-2');
    });

    it('handles top-level findMany failure gracefully', async () => {
      prisma.adRule.findMany.mockRejectedValue(new Error('database connection lost'));

      await expect(
        (
          service as unknown as { evaluateRulesWithObservability: () => Promise<void> }
        ).evaluateRulesWithObservability(),
      ).resolves.toBeUndefined();
    });
  });
});
