import { Test, TestingModule } from '@nestjs/testing';
import { KloelWorkspaceContextDataService } from './kloel-workspace-context-data.service';
import { PrismaService } from '../prisma/prisma.service';
import type { KloelContextFormatterLimits } from './kloel-context-formatter.types';

jest.mock('../common/products/legacy-products.util', () => ({
  filterLegacyProducts: jest.fn((products: unknown[]) => products),
  isLegacyProductName: jest.fn(() => false),
}));

type ContextDataPrismaMock = {
  workspace: { findUnique: jest.Mock };
  product: { findMany: jest.Mock; count: jest.Mock };
  subscription: { findUnique: jest.Mock };
  invoice: { findMany: jest.Mock };
  externalPaymentLink: { findMany: jest.Mock };
  integration: { findMany: jest.Mock };
  affiliateRequest: { findMany: jest.Mock };
  affiliateLink: { findMany: jest.Mock };
  affiliatePartner: { findMany: jest.Mock };
  customerSubscription: { findMany: jest.Mock };
  physicalOrder: { findMany: jest.Mock };
  payment: { findMany: jest.Mock };
  kloelMemory: { findMany: jest.Mock; findUnique: jest.Mock };
};

const DEFAULT_LIMITS: KloelContextFormatterLimits = {
  workspaceProductPlanLimit: 3,
  workspaceProductUrlLimit: 3,
  workspaceProductReviewLimit: 2,
  workspaceProductCheckoutLimit: 1,
  workspaceProductCouponLimit: 2,
  workspaceProductCampaignLimit: 2,
  workspaceProductCommissionLimit: 3,
  workspaceAffiliateContextLimit: 10,
  workspaceInvoiceContextLimit: 3,
  workspaceExternalLinkContextLimit: 4,
  workspaceIntegrationContextLimit: 8,
  workspaceCustomerSubscriptionContextLimit: 4,
  workspacePhysicalOrderContextLimit: 4,
  workspacePaymentContextLimit: 4,
  workspaceAffiliatePartnerContextLimit: 5,
};

describe('KloelWorkspaceContextDataService', () => {
  let service: KloelWorkspaceContextDataService;
  let prisma: ContextDataPrismaMock;

  const wsId = 'ws-1';

  beforeEach(async () => {
    prisma = {
      workspace: {
        findUnique: jest.fn().mockResolvedValue({
          providerSettings: {},
          customDomain: 'example.com',
          branding: { primaryColor: '#000' },
          stripeCustomerId: 'cus_123',
        }),
      },
      product: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      subscription: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      invoice: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      externalPaymentLink: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      integration: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      affiliateRequest: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      affiliateLink: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      affiliatePartner: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      customerSubscription: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      physicalOrder: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      payment: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      kloelMemory: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KloelWorkspaceContextDataService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<KloelWorkspaceContextDataService>(KloelWorkspaceContextDataService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('fetchAll', () => {
    it('fetches workspace record with correct workspaceId', async () => {
      await service.fetchAll(wsId, DEFAULT_LIMITS);

      expect(prisma.workspace.findUnique).toHaveBeenCalledWith({
        where: { id: wsId },
        select: expect.objectContaining({
          providerSettings: true,
          customDomain: true,
          branding: true,
          stripeCustomerId: true,
        }),
      });
    });

    it('returns null workspace when not found', async () => {
      prisma.workspace.findUnique.mockResolvedValue(null);

      const result = await service.fetchAll(wsId, DEFAULT_LIMITS);

      expect(result.workspace).toBeNull();
    });

    it('fetches products scoped to workspaceId', async () => {
      await service.fetchAll(wsId, DEFAULT_LIMITS);

      expect(prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workspaceId: wsId },
        }),
      );
      expect(prisma.product.count).toHaveBeenCalledWith({
        where: { workspaceId: wsId },
      });
    });

    it('fetches subscription scoped to workspaceId', async () => {
      await service.fetchAll(wsId, DEFAULT_LIMITS);

      expect(prisma.subscription.findUnique).toHaveBeenCalledWith({
        where: { workspaceId: wsId },
        select: expect.objectContaining({ status: true, plan: true }),
      });
    });

    it('fetches invoices scoped to workspaceId', async () => {
      await service.fetchAll(wsId, DEFAULT_LIMITS);

      expect(prisma.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workspaceId: wsId },
          take: DEFAULT_LIMITS.workspaceInvoiceContextLimit,
        }),
      );
    });

    it('fetches external payment links scoped to workspaceId', async () => {
      await service.fetchAll(wsId, DEFAULT_LIMITS);

      expect(prisma.externalPaymentLink.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workspaceId: wsId, isActive: true },
        }),
      );
    });

    it('fetches integrations scoped to workspaceId', async () => {
      await service.fetchAll(wsId, DEFAULT_LIMITS);

      expect(prisma.integration.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workspaceId: wsId },
          take: DEFAULT_LIMITS.workspaceIntegrationContextLimit,
        }),
      );
    });

    it('fetches affiliate requests scoped to workspaceId', async () => {
      await service.fetchAll(wsId, DEFAULT_LIMITS);

      expect(prisma.affiliateRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { affiliateWorkspaceId: wsId },
        }),
      );
    });

    it('fetches affiliate links scoped to workspaceId', async () => {
      await service.fetchAll(wsId, DEFAULT_LIMITS);

      expect(prisma.affiliateLink.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { affiliateWorkspaceId: wsId },
        }),
      );
    });

    it('fetches affiliate partners scoped to workspaceId', async () => {
      await service.fetchAll(wsId, DEFAULT_LIMITS);

      expect(prisma.affiliatePartner.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workspaceId: wsId },
        }),
      );
    });

    it('fetches customer subscriptions scoped to workspaceId', async () => {
      await service.fetchAll(wsId, DEFAULT_LIMITS);

      expect(prisma.customerSubscription.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workspaceId: wsId },
        }),
      );
    });

    it('fetches physical orders scoped to workspaceId', async () => {
      await service.fetchAll(wsId, DEFAULT_LIMITS);

      expect(prisma.physicalOrder.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workspaceId: wsId },
        }),
      );
    });

    it('fetches payments scoped to workspaceId', async () => {
      await service.fetchAll(wsId, DEFAULT_LIMITS);

      expect(prisma.payment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workspaceId: wsId },
        }),
      );
    });

    it('fetches memories scoped to workspaceId', async () => {
      await service.fetchAll(wsId, DEFAULT_LIMITS);

      expect(prisma.kloelMemory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workspaceId: wsId },
        }),
      );
    });

    it('fetches user profile when userId is provided', async () => {
      await service.fetchAll(wsId, DEFAULT_LIMITS, 'user-1');

      expect(prisma.kloelMemory.findUnique).toHaveBeenCalledWith({
        where: { workspaceId_key: { workspaceId: wsId, key: 'user_profile:user-1' } },
      });
    });

    it('does not fetch user profile when userId is not provided', async () => {
      await service.fetchAll(wsId, DEFAULT_LIMITS);

      expect(prisma.kloelMemory.findUnique).not.toHaveBeenCalled();
    });

    it('returns all data categories in result shape', async () => {
      const result = await service.fetchAll(wsId, DEFAULT_LIMITS);

      expect(result).toHaveProperty('workspace');
      expect(result).toHaveProperty('rawProducts');
      expect(result).toHaveProperty('rawProductCount');
      expect(result).toHaveProperty('subscription');
      expect(result).toHaveProperty('invoices');
      expect(result).toHaveProperty('externalPaymentLinks');
      expect(result).toHaveProperty('integrations');
      expect(result).toHaveProperty('affiliateRequests');
      expect(result).toHaveProperty('affiliateLinks');
      expect(result).toHaveProperty('affiliatePartners');
      expect(result).toHaveProperty('customerSubscriptions');
      expect(result).toHaveProperty('physicalOrders');
      expect(result).toHaveProperty('payments');
      expect(result).toHaveProperty('memories');
      expect(result).toHaveProperty('userProfile');
    });

    it('returns empty arrays for empty workspace data', async () => {
      const result = await service.fetchAll(wsId, DEFAULT_LIMITS);

      expect(Array.isArray(result.rawProducts)).toBe(true);
      expect(Array.isArray(result.invoices)).toBe(true);
      expect(Array.isArray(result.affiliateRequests)).toBe(true);
    });
  });

  describe('tenant isolation', () => {
    it('fetchAll uses correct workspaceId for workspace-scoped queries', async () => {
      await service.fetchAll('ws-tenant', DEFAULT_LIMITS);

      expect(prisma.workspace.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'ws-tenant' } }),
      );

      const workspaceScopedCalls = [
        prisma.product.findMany.mock.calls[0],
        prisma.product.count.mock.calls[0],
        prisma.invoice.findMany.mock.calls[0],
        prisma.payment.findMany.mock.calls[0],
        prisma.physicalOrder.findMany.mock.calls[0],
        prisma.customerSubscription.findMany.mock.calls[0],
        prisma.integration.findMany.mock.calls[0],
        prisma.affiliatePartner.findMany.mock.calls[0],
      ];

      for (const call of workspaceScopedCalls) {
        expect(call[0]).toHaveProperty(['where', 'workspaceId'], 'ws-tenant');
      }

      expect(prisma.affiliateRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { affiliateWorkspaceId: 'ws-tenant' },
        }),
      );
      expect(prisma.affiliateLink.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { affiliateWorkspaceId: 'ws-tenant' },
        }),
      );
    });
  });

  describe('error handling', () => {
    it('fetchAll propagates Prisma error from workspace query', async () => {
      prisma.workspace.findUnique.mockRejectedValue(new Error('DB down'));

      await expect(service.fetchAll(wsId, DEFAULT_LIMITS)).rejects.toThrow('DB down');
    });

    it('fetchAll propagates Prisma error from product query', async () => {
      prisma.product.findMany.mockRejectedValue(new Error('timeout'));

      await expect(service.fetchAll(wsId, DEFAULT_LIMITS)).rejects.toThrow('timeout');
    });
  });
});
