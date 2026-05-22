import { Test, TestingModule } from '@nestjs/testing';
import { KloelToolExecutorBillingService } from './kloel-tool-executor-billing.service';
import { PrismaService } from '../prisma/prisma.service';

jest.mock('../billing/stripe-runtime', () => ({
  StripeRuntime: jest.fn().mockImplementation(() => ({
    billingPortal: {
      sessions: {
        create: jest.fn().mockResolvedValue({ url: 'https://billing.stripe.com/session/test' }),
      },
    },
  })),
}));

type BillingPrismaMock = {
  workspace: { findUnique: jest.Mock };
  subscription: { upsert: jest.Mock };
};

describe('KloelToolExecutorBillingService', () => {
  let service: KloelToolExecutorBillingService;
  let prisma: BillingPrismaMock;

  const wsId = 'ws-billing-1';

  beforeEach(async () => {
    prisma = {
      workspace: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      subscription: {
        upsert: jest.fn().mockResolvedValue({}),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [KloelToolExecutorBillingService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<KloelToolExecutorBillingService>(KloelToolExecutorBillingService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('toolUpdateBillingInfo', () => {
    it('creates Stripe billing portal session when customer exists', async () => {
      prisma.workspace.findUnique.mockResolvedValue({
        stripeCustomerId: 'cus_test',
      });

      const result = await service.toolUpdateBillingInfo(wsId, {
        returnUrl: 'https://app.test/dashboard',
      });

      expect(result.success).toBe(true);
      expect(result.url).toBe('https://billing.stripe.com/session/test');
      expect(prisma.workspace.findUnique).toHaveBeenCalledWith({
        where: { id: wsId },
        select: { stripeCustomerId: true },
      });
    });

    it('returns error when workspace has no stripe customer', async () => {
      prisma.workspace.findUnique.mockResolvedValue({
        stripeCustomerId: null,
      });

      const result = await service.toolUpdateBillingInfo(wsId, {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('Nenhum método de pagamento');
    });

    it('returns error when workspace not found', async () => {
      prisma.workspace.findUnique.mockResolvedValue(null);

      const result = await service.toolUpdateBillingInfo(wsId, {});

      expect(result.success).toBe(false);
    });
  });

  describe('toolGetBillingStatus', () => {
    it('returns active status with plan', async () => {
      prisma.workspace.findUnique.mockResolvedValue({
        providerSettings: { billingSuspended: false },
        stripeCustomerId: 'cus_123',
        subscription: { plan: 'PRO', stripeId: 'sub_abc' },
      });

      const result = await service.toolGetBillingStatus(wsId);

      expect(result.success).toBe(true);
      expect(result.plan).toBe('PRO');
      expect(result.status).toBe('ACTIVE');
      expect(result.hasPaymentMethod).toBe(true);
      expect(prisma.workspace.findUnique).toHaveBeenCalledWith({
        where: { id: wsId },
        select: expect.objectContaining({
          providerSettings: true,
          stripeCustomerId: true,
        }),
      });
    });

    it('returns suspended status', async () => {
      prisma.workspace.findUnique.mockResolvedValue({
        providerSettings: { billingSuspended: true },
        stripeCustomerId: null,
        subscription: null,
      });

      const result = await service.toolGetBillingStatus(wsId);

      expect(result.status).toBe('SUSPENDED');
      expect(result.hasPaymentMethod).toBe(false);
      expect(result.success).toBe(true);
    });

    it('returns error when workspace not found', async () => {
      prisma.workspace.findUnique.mockResolvedValue(null);

      const result = await service.toolGetBillingStatus(wsId);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Workspace não encontrado');
    });
  });

  describe('toolChangePlan', () => {
    it('returns error when newPlan is missing', async () => {
      const result = await service.toolChangePlan(wsId, { newPlan: '' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Parâmetro obrigatório');
    });

    it('returns error for invalid plan', async () => {
      const result = await service.toolChangePlan(wsId, { newPlan: 'platinum' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Plano inválido');
    });

    it('redirects to billing portal when stripe subscription exists', async () => {
      prisma.workspace.findUnique.mockResolvedValue({
        subscription: { plan: 'FREE', stripeId: 'sub_xyz' },
      });

      const result = await service.toolChangePlan(wsId, { newPlan: 'pro' });

      expect(result.success).toBe(true);
      expect(result.requiresAction).toBe(true);
      expect(result.currentPlan).toBe('FREE');
      expect(result.targetPlan).toBe('PRO');
    });

    it('redirects to checkout when transitioning FREE → paid', async () => {
      prisma.workspace.findUnique.mockResolvedValue({
        subscription: { plan: null, stripeId: null },
      });

      const result = await service.toolChangePlan(wsId, { newPlan: 'starter' });

      expect(result.success).toBe(true);
      expect(result.requiresCheckout).toBe(true);
      expect(result.targetPlan).toBe('STARTER');
    });

    it('upserts subscription when changing between free/local tiers', async () => {
      prisma.workspace.findUnique.mockResolvedValue({
        subscription: { plan: 'FREE', stripeId: null },
      });

      const result = await service.toolChangePlan(wsId, { newPlan: 'free' });

      expect(result.success).toBe(true);
      expect(result.newPlan).toBe('FREE');
      expect(result.previousPlan).toBe('FREE');
      expect(prisma.subscription.upsert).toHaveBeenCalledWith({
        where: { workspaceId: wsId },
        update: { plan: 'FREE' },
        create: expect.objectContaining({
          workspaceId: wsId,
          plan: 'FREE',
          status: 'ACTIVE',
        }),
      });
    });
  });
});
