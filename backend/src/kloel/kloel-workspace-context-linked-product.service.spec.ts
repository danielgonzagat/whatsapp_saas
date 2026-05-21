import { Test, TestingModule } from '@nestjs/testing';
import { KloelWorkspaceContextLinkedProductService } from './kloel-workspace-context-linked-product.service';
import { PrismaService } from '../prisma/prisma.service';
import type { KloelContextFormatterLimits } from './kloel-context-formatter.types';

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

type LinkedProductPrismaMock = {
  product: { findFirst: jest.Mock };
  affiliateRequest: { findFirst: jest.Mock };
  affiliateLink: { findFirst: jest.Mock };
};

describe('KloelWorkspaceContextLinkedProductService', () => {
  let service: KloelWorkspaceContextLinkedProductService;
  let prisma: LinkedProductPrismaMock;

  const wsId = 'ws-1';

  beforeEach(async () => {
    prisma = {
      product: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      affiliateRequest: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      affiliateLink: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KloelWorkspaceContextLinkedProductService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<KloelWorkspaceContextLinkedProductService>(
      KloelWorkspaceContextLinkedProductService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('buildLinkedProductPromptContext', () => {
    it('returns null when linkedProduct is null', async () => {
      const result = await service.buildLinkedProductPromptContext(wsId, DEFAULT_LIMITS, null);

      expect(result).toBeNull();
    });

    it('returns null when linkedProduct is undefined', async () => {
      const result = await service.buildLinkedProductPromptContext(wsId, DEFAULT_LIMITS, undefined);

      expect(result).toBeNull();
    });

    describe('owned products', () => {
      it('returns context string for owned product found in catalog', async () => {
        prisma.product.findFirst.mockResolvedValue({
          id: 'p-1',
          name: 'Curso de Vendas',
          price: 199.9,
          currency: 'BRL',
          description: 'Curso completo de vendas',
          active: true,
          status: 'active',
          plans: [],
          checkouts: [],
          coupons: [],
          campaigns: [],
          commissions: [],
          urls: [],
          reviews: [],
        });

        const result = await service.buildLinkedProductPromptContext(wsId, DEFAULT_LIMITS, {
          source: 'owned',
          productId: 'p-1',
        });

        expect(result).not.toBeNull();
        expect(result).toContain('PRODUTO VINCULADO AO PROMPT');
        expect(result).toContain('catálogo próprio do workspace');
        expect(prisma.product.findFirst).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: 'p-1', workspaceId: wsId },
          }),
        );
      });

      it('uses linkedProduct.id when productId is not set', async () => {
        prisma.product.findFirst.mockResolvedValue({
          id: 'p-fallback',
          name: 'Fallback',
          price: 99,
          currency: 'BRL',
          active: true,
          status: 'active',
          plans: [],
          checkouts: [],
          coupons: [],
          campaigns: [],
          commissions: [],
          urls: [],
          reviews: [],
        });

        const result = await service.buildLinkedProductPromptContext(wsId, DEFAULT_LIMITS, {
          source: 'owned',
          id: 'p-fallback',
        });

        expect(result).not.toBeNull();
        expect(prisma.product.findFirst).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: 'p-fallback', workspaceId: wsId },
          }),
        );
      });

      it('returns null when owned product not found in catalog', async () => {
        const result = await service.buildLinkedProductPromptContext(wsId, DEFAULT_LIMITS, {
          source: 'owned',
          productId: 'p-nonexistent',
        });

        expect(result).toBeNull();
      });

      it('returns null when owned product ID is empty', async () => {
        const result = await service.buildLinkedProductPromptContext(wsId, DEFAULT_LIMITS, {
          source: 'owned',
          productId: '',
        });

        expect(result).toBeNull();
      });
    });

    describe('affiliate products', () => {
      it('returns context string for affiliate product with catalog data', async () => {
        prisma.affiliateRequest.findFirst.mockResolvedValue({
          status: 'APPROVED',
          affiliateProduct: {
            productId: 'producer-p-1',
            commissionPct: 20,
            commissionType: 'percentage',
            approvalMode: 'auto',
            cookieDays: 30,
          },
        });

        prisma.affiliateLink.findFirst.mockResolvedValue({
          code: 'AFF123',
          clicks: 100,
          sales: 5,
          affiliateProduct: {
            productId: 'producer-p-1',
            commissionPct: 20,
          },
        });

        prisma.product.findFirst
          .mockResolvedValueOnce({ workspaceId: 'producer-ws' })
          .mockResolvedValueOnce({
            id: 'producer-p-1',
            name: 'Produto do Produtor',
            price: 299,
            currency: 'BRL',
            description: 'Produto afiliado',
            active: true,
            status: 'active',
            plans: [],
            checkouts: [],
            coupons: [],
            campaigns: [],
            commissions: [],
            urls: [],
            reviews: [],
          });

        const result = await service.buildLinkedProductPromptContext(wsId, DEFAULT_LIMITS, {
          source: 'affiliate',
          affiliateProductId: 'aff-prod-1',
        });

        expect(result).not.toBeNull();
        expect(result).toContain('PRODUTO VINCULADO AO PROMPT');
        expect(result).toContain('catálogo de afiliados');
        expect(result).toContain('Comissão disponível: 20%');
        expect(result).toContain('Código de afiliado: AFF123');
        expect(prisma.affiliateRequest.findFirst).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { affiliateWorkspaceId: wsId, affiliateProductId: 'aff-prod-1' },
          }),
        );
        expect(prisma.affiliateLink.findFirst).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { affiliateWorkspaceId: wsId, affiliateProductId: 'aff-prod-1' },
          }),
        );
      });

      it('returns null when affiliate product ID is empty', async () => {
        const result = await service.buildLinkedProductPromptContext(wsId, DEFAULT_LIMITS, {
          source: 'affiliate',
          affiliateProductId: '',
        });

        expect(result).toBeNull();
      });

      it('returns null when no affiliate request or link found and no catalog product', async () => {
        const result = await service.buildLinkedProductPromptContext(wsId, DEFAULT_LIMITS, {
          source: 'affiliate',
          affiliateProductId: 'unknown-aff',
        });

        expect(result).toBeNull();
      });

      it('handles producer workspace lookup failure gracefully', async () => {
        prisma.affiliateRequest.findFirst.mockResolvedValue({
          status: 'APPROVED',
          affiliateProduct: { productId: 'bad-prod' },
        });
        prisma.affiliateLink.findFirst.mockResolvedValue(null);

        prisma.product.findFirst
          .mockRejectedValueOnce(new Error('lookup error'))
          .mockResolvedValueOnce(null);

        const result = await service.buildLinkedProductPromptContext(wsId, DEFAULT_LIMITS, {
          source: 'affiliate',
          affiliateProductId: 'aff-bad',
        });

        expect(result).not.toBeNull();
        expect(result).toContain('PRODUTO VINCULADO AO PROMPT');
      });
    });

    describe('source detection', () => {
      it('defaults to owned when source is not set', async () => {
        prisma.product.findFirst.mockResolvedValue({
          id: 'p-1',
          name: 'Produto',
          price: 99,
          currency: 'BRL',
          active: true,
          status: 'active',
          plans: [],
          checkouts: [],
          coupons: [],
          campaigns: [],
          commissions: [],
          urls: [],
          reviews: [],
        });

        const result = await service.buildLinkedProductPromptContext(wsId, DEFAULT_LIMITS, {
          productId: 'p-1',
        });

        expect(result).toContain('catálogo próprio');
      });
    });
  });

  describe('tenant isolation', () => {
    it('owned product lookup scopes to workspaceId', async () => {
      prisma.product.findFirst.mockResolvedValue({
        id: 'p-1',
        name: 'Produto',
        price: 99,
        currency: 'BRL',
        active: true,
        status: 'active',
        plans: [],
        checkouts: [],
        coupons: [],
        campaigns: [],
        commissions: [],
        urls: [],
        reviews: [],
      });

      await service.buildLinkedProductPromptContext('ws-tenant', DEFAULT_LIMITS, {
        source: 'owned',
        productId: 'p-1',
      });

      expect(prisma.product.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'p-1', workspaceId: 'ws-tenant' },
        }),
      );
    });

    it('affiliate lookup scopes to affiliateWorkspaceId', async () => {
      prisma.affiliateRequest.findFirst.mockResolvedValue(null);
      prisma.affiliateLink.findFirst.mockResolvedValue(null);

      await service.buildLinkedProductPromptContext('ws-tenant', DEFAULT_LIMITS, {
        source: 'affiliate',
        affiliateProductId: 'aff-prod-1',
      });

      expect(prisma.affiliateRequest.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { affiliateWorkspaceId: 'ws-tenant', affiliateProductId: 'aff-prod-1' },
        }),
      );
      expect(prisma.affiliateLink.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { affiliateWorkspaceId: 'ws-tenant', affiliateProductId: 'aff-prod-1' },
        }),
      );
    });
  });

  describe('error handling', () => {
    it('propagates Prisma error from owned product lookup', async () => {
      prisma.product.findFirst.mockRejectedValue(new Error('DB down'));

      await expect(
        service.buildLinkedProductPromptContext(wsId, DEFAULT_LIMITS, {
          source: 'owned',
          productId: 'p-1',
        }),
      ).rejects.toThrow('DB down');
    });

    it('propagates Prisma error from affiliate request lookup', async () => {
      prisma.affiliateRequest.findFirst.mockRejectedValue(new Error('timeout'));

      await expect(
        service.buildLinkedProductPromptContext(wsId, DEFAULT_LIMITS, {
          source: 'affiliate',
          affiliateProductId: 'aff-1',
        }),
      ).rejects.toThrow('timeout');
    });
  });
});
