import { NotFoundException } from '@nestjs/common';
import { CheckoutProductConfigService } from './checkout-product-config.service';
import { CheckoutPlanLinkManager } from './checkout-plan-link.manager';

type PrismaMock = {
  checkoutProductPlan: {
    findUnique: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
  };
  checkoutConfig: {
    create: jest.Mock;
    update: jest.Mock;
  };
  checkoutPlanLink: { create: jest.Mock };
  marketplaceFee: { findMany: jest.Mock };
  $transaction: jest.Mock;
};

const makePlan = (overrides: Record<string, unknown> = {}) => ({
  id: 'plan_1',
  productId: 'prod_1',
  kind: 'PLAN',
  name: 'Test Plan',
  slug: 'test-plan',
  referenceCode: 'REF123',
  priceInCents: 9900,
  currency: 'BRL',
  maxInstallments: 12,
  installmentsFee: false,
  legacyCheckoutEnabled: true,
  checkoutConfig: null,
  checkoutLinks: [],
  product: { id: 'prod_1', workspaceId: 'ws_1', name: 'Test Product' },
  ...overrides,
});

describe('CheckoutProductConfigService', () => {
  let service: CheckoutProductConfigService;
  let prisma: PrismaMock;

  beforeEach(() => {
    prisma = {
      checkoutProductPlan: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
      },
      checkoutConfig: {
        create: jest.fn(),
        update: jest.fn(),
      },
      checkoutPlanLink: { create: jest.fn() },
      marketplaceFee: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn(),
    };
    service = new CheckoutProductConfigService(prisma as never);
  });

  describe('buildDefaultCheckoutConfigInput', () => {
    it('returns default config with brand name', () => {
      const result = service.buildDefaultCheckoutConfigInput('MyBrand');

      expect(result.brandName).toBe('MyBrand');
      expect(result.enableCreditCard).toBe(true);
      expect(result.enablePix).toBe(true);
      expect(result.enableBoleto).toBe(false);
      expect(result.enableCoupon).toBe(true);
    });

    it('falls back to "Checkout" when brand name is empty', () => {
      const result = service.buildDefaultCheckoutConfigInput('');

      expect(result.brandName).toBe('Checkout');
    });
  });

  describe('resolveMarketplaceFeePercent', () => {
    it('returns fee from matching database row', async () => {
      prisma.marketplaceFee.findMany.mockResolvedValue([
        {
          id: 'fee_1',
          method: 'PIX',
          feeBps: 890,
          activeFrom: new Date('2020-01-01'),
          volumeFloorInCents: 0n,
          volumeCeilingInCents: null,
        },
      ]);

      const result = await service.resolveMarketplaceFeePercent('PIX', 50000);

      expect(result).toBe(8.9);
      expect(prisma.marketplaceFee.findMany).toHaveBeenCalled();
      const callArg = prisma.marketplaceFee.findMany.mock.calls[0][0] as Record<string, unknown>;
      expect(callArg.where).toEqual(expect.objectContaining({ method: { in: ['PIX', '*'] } }));
    });

    it('falls back to wildcard (*) method when specific method not found', async () => {
      prisma.marketplaceFee.findMany.mockResolvedValue([
        {
          id: 'fee_wc',
          method: '*',
          feeBps: 499,
          activeFrom: new Date('2020-01-01'),
          volumeFloorInCents: 0n,
          volumeCeilingInCents: null,
        },
      ]);

      const result = await service.resolveMarketplaceFeePercent('PIX', 50000);

      expect(result).toBe(4.99);
    });

    it('returns default 9.9% when no fee rows match', async () => {
      prisma.marketplaceFee.findMany.mockResolvedValue([]);

      const result = await service.resolveMarketplaceFeePercent('PIX', 50000);

      expect(result).toBe(9.9);
    });

    it('prefers exact method match over wildcard', async () => {
      prisma.marketplaceFee.findMany.mockResolvedValue([
        {
          id: 'fee_pix',
          method: 'PIX',
          feeBps: 390,
          activeFrom: new Date('2021-01-01'),
          volumeFloorInCents: 0n,
          volumeCeilingInCents: null,
        },
        {
          id: 'fee_wc',
          method: '*',
          feeBps: 499,
          activeFrom: new Date('2020-01-01'),
          volumeFloorInCents: 0n,
          volumeCeilingInCents: null,
        },
      ]);

      const result = await service.resolveMarketplaceFeePercent('PIX', 50000);

      expect(result).toBe(3.9);
    });

    it('converts baseTotalInCents to BigInt for volume query', async () => {
      prisma.marketplaceFee.findMany.mockResolvedValue([
        {
          id: 'fee_v',
          method: 'CREDIT_CARD',
          feeBps: 499,
          activeFrom: new Date('2020-01-01'),
          volumeFloorInCents: 0n,
          volumeCeilingInCents: null,
        },
      ]);

      await service.resolveMarketplaceFeePercent('CREDIT_CARD', 999.9);

      expect(prisma.marketplaceFee.findMany).toHaveBeenCalled();
      const callArg = prisma.marketplaceFee.findMany.mock.calls[0][0] as Record<string, unknown>;
      expect(callArg.where).toEqual(
        expect.objectContaining({
          volumeFloorInCents: { lte: 1000n },
        }),
      );
    });
  });

  describe('buildPricingPreview', () => {
    it('returns marketplace pricing using PIX as default', async () => {
      prisma.marketplaceFee.findMany.mockResolvedValue([
        {
          id: 'fee_1',
          method: 'PIX',
          feeBps: 390,
          activeFrom: new Date('2020-01-01'),
          volumeFloorInCents: 0n,
          volumeCeilingInCents: null,
        },
      ]);

      const result = await service.buildPricingPreview(10000);

      expect(result).toHaveProperty('sellerReceivableInCents');
      expect(result).toHaveProperty('marketplaceFeeInCents');
      expect(result).toHaveProperty('estimatedGatewayFeeInCents');
      expect(typeof result.sellerReceivableInCents).toBe('number');
    });
  });

  describe('buildClonedCheckoutConfigInput', () => {
    it('strips metadata fields (id, planId, etc.) from source config', () => {
      const sourceConfig = {
        id: 'cfg_old',
        planId: 'plan_old',
        plan: {},
        pixels: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        brandName: 'Original Brand',
        theme: 'DARK',
        accentColor: '#FF0000',
      };

      const result = service.buildClonedCheckoutConfigInput(sourceConfig, 'Fallback');

      expect(result).not.toHaveProperty('id');
      expect(result).not.toHaveProperty('planId');
      expect(result).not.toHaveProperty('plan');
      expect(result).not.toHaveProperty('pixels');
      expect(result).not.toHaveProperty('createdAt');
      expect(result).not.toHaveProperty('updatedAt');
      expect(result.brandName).toBe('Original Brand');
      expect(result.theme).toBe('DARK');
      expect(result.accentColor).toBe('#FF0000');
    });

    it('falls back to default config when source is null', () => {
      const result = service.buildClonedCheckoutConfigInput(null, 'MyBrand');

      expect(result.brandName).toBe('MyBrand');
      expect(result.enableCreditCard).toBe(true);
    });

    it('uses fallback brand name when source has no brand', () => {
      const sourceConfig = { id: 'x', planId: 'y', brandName: '' };
      const result = service.buildClonedCheckoutConfigInput(sourceConfig, 'FallbackBrand');

      expect(result.brandName).toBe('FallbackBrand');
    });
  });

  describe('ensureLegacyCheckoutForPlan', () => {
    const slugFn = jest.fn().mockResolvedValue('test-plan-checkout');
    const codeFn = jest.fn().mockResolvedValue('CHKCODE1');
    const planLinkMgr = {
      generateCheckoutSlug: slugFn,
      generatePublicCheckoutCode: codeFn,
    } as CheckoutPlanLinkManager;

    it('skips when plan is not kind PLAN', async () => {
      const plan = makePlan({ kind: 'CHECKOUT' });
      prisma.checkoutProductPlan.findUnique.mockResolvedValue(plan);

      await service.ensureLegacyCheckoutForPlan('plan_1', planLinkMgr);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('skips when checkout links already exist', async () => {
      const plan = makePlan({ checkoutLinks: [{ id: 'cl_1' }] });
      prisma.checkoutProductPlan.findUnique.mockResolvedValue(plan);

      await service.ensureLegacyCheckoutForPlan('plan_1', planLinkMgr);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('creates legacy checkout when no links exist (PLAN kind)', async () => {
      const plan = makePlan();
      prisma.checkoutProductPlan.findUnique.mockResolvedValue(plan);

      prisma.$transaction.mockImplementation(
        async (fn: (tx: Record<string, unknown>) => Promise<unknown>) => {
          const tx = {
            checkoutProductPlan: {
              create: jest.fn().mockResolvedValue({ id: 'chk_legacy', kind: 'CHECKOUT' }),
            },
            checkoutConfig: {
              create: jest.fn().mockResolvedValue({ id: 'cfg_legacy' }),
            },
            checkoutPlanLink: {
              create: jest.fn().mockResolvedValue({ id: 'cpl_1' }),
            },
          };
          return fn(tx);
        },
      );

      await service.ensureLegacyCheckoutForPlan('plan_1', planLinkMgr);

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(slugFn).toHaveBeenCalled();
      expect(codeFn).toHaveBeenCalled();
    });

    it('skips when plan is null', async () => {
      prisma.checkoutProductPlan.findUnique.mockResolvedValue(null);

      await service.ensureLegacyCheckoutForPlan('plan_1', planLinkMgr);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('resetConfig', () => {
    it('resets config to defaults within transaction', async () => {
      const plan = makePlan();
      prisma.$transaction.mockImplementation(
        async (fn: (tx: Record<string, unknown>) => Promise<unknown>) => {
          const tx = {
            checkoutProductPlan: {
              findUnique: jest.fn().mockResolvedValue(plan),
            },
            checkoutConfig: {
              update: jest
                .fn()
                .mockResolvedValue({ id: 'cfg_1', planId: 'plan_1', theme: 'BLANC' }),
            },
          };
          return fn(tx);
        },
      );

      const result = await service.resetConfig('plan_1');

      expect(result).toHaveProperty('theme', 'BLANC');
      expect(prisma.$transaction).toHaveBeenCalled();
      const [fnArg, opts] = prisma.$transaction.mock.calls[0] as [unknown, unknown];
      expect(fnArg).toBeInstanceOf(Function);
      expect(opts).toEqual({ isolationLevel: 'ReadCommitted' });
    });

    it('throws NotFoundException when plan not found', async () => {
      prisma.$transaction.mockImplementation(
        async (fn: (tx: Record<string, unknown>) => Promise<unknown>) => {
          const tx = {
            checkoutProductPlan: {
              findUnique: jest.fn().mockResolvedValue(null),
            },
            checkoutConfig: { update: jest.fn() },
          };
          return fn(tx);
        },
      );

      await expect(service.resetConfig('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('ensureLegacyCheckoutsForProduct', () => {
    const planLinkMgr = {
      generateCheckoutSlug: jest.fn().mockResolvedValue('chk-slug'),
      generatePublicCheckoutCode: jest.fn().mockResolvedValue('CHKCODE'),
    } as CheckoutPlanLinkManager;

    it('processes all legacy-enabled PLAN-kind entries', async () => {
      prisma.checkoutProductPlan.findMany.mockResolvedValue([{ id: 'plan_a' }, { id: 'plan_b' }]);

      prisma.checkoutProductPlan.findUnique.mockResolvedValue(makePlan({ id: 'plan_a' }));

      prisma.$transaction.mockImplementation(
        async (fn: (tx: Record<string, unknown>) => Promise<unknown>) => {
          const tx = {
            checkoutProductPlan: {
              create: jest.fn().mockResolvedValue({ id: 'chk_legacy' }),
            },
            checkoutConfig: {
              create: jest.fn().mockResolvedValue({ id: 'cfg' }),
            },
            checkoutPlanLink: {
              create: jest.fn().mockResolvedValue({ id: 'cpl' }),
            },
          };
          return fn(tx);
        },
      );

      await service.ensureLegacyCheckoutsForProduct('prod_1', planLinkMgr);

      expect(prisma.checkoutProductPlan.findMany).toHaveBeenCalledWith({
        where: { productId: 'prod_1', kind: 'PLAN', legacyCheckoutEnabled: true },
        select: { id: true },
      });
      expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    });

    it('skips when no legacy plans found', async () => {
      prisma.checkoutProductPlan.findMany.mockResolvedValue([]);

      await service.ensureLegacyCheckoutsForProduct('prod_1', planLinkMgr);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('error propagation', () => {
    it('propagates database errors from resolveMarketplaceFeePercent', async () => {
      prisma.marketplaceFee.findMany.mockRejectedValue(new Error('DB fetch error'));

      await expect(service.resolveMarketplaceFeePercent('PIX', 1000)).rejects.toThrow(
        'DB fetch error',
      );
    });
  });
});
