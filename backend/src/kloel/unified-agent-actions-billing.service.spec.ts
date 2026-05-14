import { Test, TestingModule } from '@nestjs/testing';
import { UnifiedAgentActionsBillingService } from './unified-agent-actions-billing.service';
import { PrismaService } from '../prisma/prisma.service';

jest.mock('./unified-agent-actions-billing.helpers', () => ({
  createFunnelFlows: jest.fn().mockResolvedValue([
    { id: 'f-1', name: 'Funil - awareness' },
    { id: 'f-2', name: 'Funil - interest' },
    { id: 'f-3', name: 'Funil - purchase' },
  ]),
  getProductPlans: jest.fn().mockResolvedValue({ plans: [] }),
  getProductAIConfig: jest.fn().mockResolvedValue({ config: null }),
  getProductReviews: jest.fn().mockResolvedValue({ reviews: [] }),
  getProductUrls: jest.fn().mockResolvedValue({ urls: [] }),
  validateCoupon: jest.fn().mockResolvedValue({ valid: false, reason: 'not_found' }),
}));

jest.mock('../billing/stripe-runtime', () => ({
  StripeRuntime: jest.fn().mockImplementation(() => ({
    customers: {
      create: jest.fn().mockResolvedValue({ id: 'cus_test' }),
    },
    setupIntents: {
      create: jest.fn().mockResolvedValue({
        client_secret: 'seti_secret',
        id: 'seti_1',
      }),
    },
    subscriptions: {
      create: jest.fn().mockResolvedValue({
        id: 'sub_1',
        status: 'active',
        items: { data: [{ id: 'si_1' }] },
      }),
      update: jest.fn().mockResolvedValue({
        id: 'sub_1',
        status: 'active',
        items: { data: [{ id: 'si_1' }] },
      }),
      retrieve: jest.fn().mockResolvedValue({
        id: 'sub_1',
        status: 'active',
        items: { data: [{ id: 'si_1' }] },
      }),
    },
  })),
}));

type BillingPrismaMock = {
  message: { count: jest.Mock };
  contact: { count: jest.Mock };
  autopilotEvent: { count: jest.Mock; groupBy: jest.Mock };
  flow: { findFirst: jest.Mock };
  product: { findFirst: jest.Mock };
  workspace: { findUnique: jest.Mock; update: jest.Mock };
  $queryRaw: jest.Mock;
  $transaction: jest.Mock;
};

describe('UnifiedAgentActionsBillingService', () => {
  let service: UnifiedAgentActionsBillingService;
  let prisma: BillingPrismaMock;

  const wsId = 'ws-1';

  beforeEach(async () => {
    prisma = {
      message: { count: jest.fn().mockResolvedValue(100) },
      contact: { count: jest.fn().mockResolvedValue(50) },
      autopilotEvent: {
        count: jest.fn().mockResolvedValue(10),
        groupBy: jest.fn().mockResolvedValue([{ status: 'converted', _count: 5 }]),
      },
      flow: { findFirst: jest.fn().mockResolvedValue(null) },
      product: { findFirst: jest.fn().mockResolvedValue(null) },
      workspace: {
        findUnique: jest.fn().mockResolvedValue({
          id: wsId,
          name: 'Test Workspace',
          stripeCustomerId: null,
          providerSettings: {
            plan: 'free',
            subscriptionStatus: 'active',
          },
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      $queryRaw: jest.fn().mockResolvedValue([{ avg_minutes: 2.5 }]),
      $transaction: jest.fn().mockImplementation((arg: unknown) => {
        if (typeof arg === 'function') {
          return arg(prisma);
        }
        return Promise.resolve(undefined);
      }),
    };

    process.env.STRIPE_SECRET_KEY = 'sk_test_mock';

    const module: TestingModule = await Test.createTestingModule({
      providers: [UnifiedAgentActionsBillingService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<UnifiedAgentActionsBillingService>(UnifiedAgentActionsBillingService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('actionGetAnalytics', () => {
    it('returns message count for metric=messages', async () => {
      const result = await service.actionGetAnalytics(wsId, {
        metric: 'messages',
        period: 'week',
      });

      expect(result.success).toBe(true);
      expect(result.data.total).toBe(100);
      const messageCountArgs = prisma.message.count.mock.calls[0][0];
      expect(messageCountArgs.where).toEqual(
        expect.objectContaining({
          workspaceId: wsId,
          createdAt: messageCountArgs.where.createdAt,
        }),
      );
      expect(messageCountArgs.where.createdAt).toBeDefined();
    });

    it('returns contact counts for metric=contacts', async () => {
      const result = await service.actionGetAnalytics(wsId, {
        metric: 'contacts',
        period: 'month',
      });

      expect(result.data.total).toBe(50);
      expect(result.data.active).toBe(50);
    });

    it('returns sales count for metric=sales', async () => {
      const result = await service.actionGetAnalytics(wsId, {
        metric: 'sales',
        period: 'week',
      });

      const eventCountArgs = prisma.autopilotEvent.count.mock.calls[0][0];
      expect(eventCountArgs.where).toEqual({
        workspaceId: wsId,
        action: 'PAYMENT_RECEIVED',
        createdAt: eventCountArgs.where.createdAt,
      });
      expect(eventCountArgs.where.createdAt).toBeDefined();
      expect(result.success).toBe(true);
    });

    it('returns conversion events for metric=conversions', async () => {
      const result = await service.actionGetAnalytics(wsId, {
        metric: 'conversions',
      });

      expect(result.data.events).toHaveLength(1);
    });

    it('returns response time for metric=response_time', async () => {
      const result = await service.actionGetAnalytics(wsId, {
        metric: 'response_time',
      });

      expect(result.data.averageMinutes).toBe(2.5);
      expect(prisma.$queryRaw).toHaveBeenCalled();
    });
  });

  describe('actionGenerateSalesFunnel', () => {
    it('creates funnel flows and returns them', async () => {
      prisma.product.findFirst.mockResolvedValue({
        id: 'p-1',
        name: 'Curso',
        price: 99.9,
      });

      const result = await service.actionGenerateSalesFunnel(wsId, {
        funnelName: 'Meu Funil',
        productId: 'p-1',
      });

      expect(result.success).toBe(true);
      expect(result.flows).toHaveLength(3);
    });
  });

  describe('actionGetBillingStatus', () => {
    it('returns billing status for workspace', async () => {
      const result = await service.actionGetBillingStatus(wsId);

      expect(result.success).toBe(true);
      expect(result.billing.plan).toBe('free');
      expect(result.billing.status).toBe('active');
      expect(prisma.workspace.findUnique).toHaveBeenCalledWith({
        where: { id: wsId },
      });
    });

    it('returns error when workspace not found', async () => {
      prisma.workspace.findUnique.mockResolvedValue(null);

      const result = await service.actionGetBillingStatus('no-exist');

      expect(result.success).toBe(false);
    });
  });

  describe('actionChangePlan', () => {
    it('rejects invalid plan name', async () => {
      const result = await service.actionChangePlan(wsId, { plan: 'invalid' });

      expect(result.success).toBe(false);
    });

    it('requires stripe customer to exist', async () => {
      process.env.STRIPE_PRICE_PRO = 'price_pro';

      const result = await service.actionChangePlan(wsId, { plan: 'pro' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Nenhum cartão cadastrado');
    });

    it('changes plan when customer exists', async () => {
      process.env.STRIPE_PRICE_PRO = 'price_pro';
      prisma.workspace.findUnique.mockResolvedValue({
        id: wsId,
        name: 'Test',
        providerSettings: { stripeCustomerId: 'cus_test' },
      });

      const result = await service.actionChangePlan(wsId, { plan: 'pro' });

      expect(result.success).toBe(true);
    });
  });

  describe('product data query tools', () => {
    it('getProductPlans delegates to companion', async () => {
      const result = await service.getProductPlans('p-1');
      expect(result.plans).toEqual([]);
    });

    it('getProductAIConfig delegates to companion', async () => {
      const result = await service.getProductAIConfig('p-1');
      expect(result.config).toBeNull();
    });

    it('getProductReviews delegates to companion', async () => {
      const result = await service.getProductReviews('p-1');
      expect(result.reviews).toEqual([]);
    });

    it('getProductUrls delegates to companion', async () => {
      const result = await service.getProductUrls('p-1');
      expect(result.urls).toEqual([]);
    });

    it('validateCoupon delegates to companion', async () => {
      const result = await service.validateCoupon('p-1', 'INVALID');
      expect(result.valid).toBe(false);
    });
  });

  describe('tenant isolation', () => {
    it('actionGetAnalytics filters by workspaceId', async () => {
      await service.actionGetAnalytics('ws-tenant', { metric: 'messages' });

      expect(prisma.message.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ workspaceId: 'ws-tenant' }),
        }),
      );
    });

    it('actionGetBillingStatus queries correct workspace', async () => {
      await service.actionGetBillingStatus('ws-tenant');

      expect(prisma.workspace.findUnique).toHaveBeenCalledWith({
        where: { id: 'ws-tenant' },
      });
    });
  });

  describe('error handling', () => {
    it('actionGetAnalytics propagates db error', async () => {
      prisma.message.count.mockRejectedValue(new Error('DB down'));

      await expect(service.actionGetAnalytics(wsId, { metric: 'messages' })).rejects.toThrow(
        'DB down',
      );
    });

    it('actionGetBillingStatus propagates db error', async () => {
      prisma.workspace.findUnique.mockRejectedValue(new Error('connection lost'));

      await expect(service.actionGetBillingStatus(wsId)).rejects.toThrow('connection lost');
    });
  });
});
