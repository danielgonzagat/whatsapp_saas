import { NotFoundException } from '@nestjs/common';
import { CheckoutCatalogConfigService } from './checkout-catalog-config.service';

type PrismaMock = {
  checkoutProductPlan: { findUnique: jest.Mock };
  $transaction: jest.Mock;
};

const makePlan = (overrides: Record<string, unknown> = {}) => ({
  id: 'plan_1',
  slug: 'my-plan',
  name: 'My Plan',
  priceInCents: 5000,
  freeShipping: false,
  shippingPrice: null,
  checkoutConfig: {
    id: 'cfg_1',
    planId: 'plan_1',
    shippingMode: 'FIXED',
    shippingOriginZip: '04538133',
    shippingVariableMinInCents: null,
    shippingVariableMaxInCents: null,
    shippingUseKloelCalculator: false,
  },
  ...overrides,
});

describe('CheckoutCatalogConfigService', () => {
  let service: CheckoutCatalogConfigService;
  let prisma: PrismaMock;

  beforeEach(() => {
    prisma = {
      checkoutProductPlan: { findUnique: jest.fn() },
      $transaction: jest.fn(),
    };
    service = new CheckoutCatalogConfigService(prisma as never);
  });

  describe('calculateShipping', () => {
    it('returns shipping options when plan is found (FIXED mode)', async () => {
      const plan = makePlan();
      prisma.checkoutProductPlan.findUnique.mockResolvedValue(plan);

      const result = await service.calculateShipping('my-plan', '04538000');

      expect(prisma.checkoutProductPlan.findUnique).toHaveBeenCalledWith({
        where: { slug: 'my-plan' },
        include: { checkoutConfig: true },
      });
      expect(result).toHaveProperty('options');
      expect(result.options).toHaveLength(1);
      expect(result.options[0]).toHaveProperty('price');
      expect(typeof result.options[0].price).toBe('number');
    });

    it('returns shipping options when plan has freeShipping', async () => {
      const plan = makePlan({ freeShipping: true, checkoutConfig: null });
      prisma.checkoutProductPlan.findUnique.mockResolvedValue(plan);

      const result = await service.calculateShipping('free-plan', '04538000');

      expect(result.options).toHaveLength(1);
      expect(result.options[0].price).toBe(0);
      expect(result.options[0].carrier).toBe('free');
    });

    it('throws NotFoundException when slug is not found', async () => {
      prisma.checkoutProductPlan.findUnique.mockResolvedValue(null);

      await expect(service.calculateShipping('missing-slug', '04538000')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('handles variable shipping mode with zip-based calculation', async () => {
      const plan = makePlan({
        checkoutConfig: {
          id: 'cfg_var',
          planId: 'plan_1',
          shippingMode: 'VARIABLE',
          shippingOriginZip: '04538133',
          shippingVariableMinInCents: 1500,
          shippingVariableMaxInCents: 4500,
          shippingUseKloelCalculator: false,
        },
      });
      prisma.checkoutProductPlan.findUnique.mockResolvedValue(plan);

      const result = await service.calculateShipping('var-plan', '20000000');

      expect(result.options).toHaveLength(1);
      expect(result.options[0].carrier).toBe('variable');
      expect(result.options[0].price).toBeGreaterThan(0);
    });
  });

  describe('resetConfig', () => {
    it('resets config to defaults with transaction', async () => {
      const plan = makePlan({ product: { name: 'Test Product', id: 'prod_1' } });
      const updatedConfig = { id: 'cfg_1', planId: 'plan_1', theme: 'BLANC' };

      prisma.$transaction.mockImplementation(
        async (
          fn: (tx: {
            checkoutProductPlan: { findUnique: jest.Mock };
            checkoutConfig: { update: jest.Mock };
          }) => Promise<unknown>,
        ) => {
          const tx = {
            checkoutProductPlan: {
              findUnique: jest.fn().mockResolvedValue(plan),
            },
            checkoutConfig: {
              update: jest.fn().mockResolvedValue(updatedConfig),
            },
          };
          return fn(tx);
        },
      );

      const result = await service.resetConfig('plan_1');

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(result).toEqual(updatedConfig);
    });

    it('throws NotFoundException when plan does not exist', async () => {
      prisma.$transaction.mockImplementation(
        async (
          fn: (tx: {
            checkoutProductPlan: { findUnique: jest.Mock };
            checkoutConfig: { update: jest.Mock };
          }) => Promise<unknown>,
        ) => {
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

    it('resets with correct default values', async () => {
      const plan = makePlan({ product: { name: 'Brand', id: 'prod_1' } });
      const txUpdate = jest
        .fn()
        .mockResolvedValue({ id: 'cfg_1', planId: 'plan_1', theme: 'BLANC' });

      prisma.$transaction.mockImplementation(
        async (
          fn: (tx: {
            checkoutProductPlan: { findUnique: jest.Mock };
            checkoutConfig: { update: jest.Mock };
          }) => Promise<unknown>,
        ) => {
          const tx = {
            checkoutProductPlan: {
              findUnique: jest.fn().mockResolvedValue(plan),
            },
            checkoutConfig: { update: txUpdate },
          };
          return fn(tx);
        },
      );

      await service.resetConfig('plan_1');

      const callData = txUpdate.mock.calls[0][0] as Record<string, unknown>;
      expect(callData.where).toEqual({ planId: 'plan_1' });
      expect(callData.data).toEqual(
        expect.objectContaining({
          theme: 'BLANC',
          brandName: 'Brand',
          enableCreditCard: true,
          enablePix: true,
          enableBoleto: false,
          enableCoupon: true,
          btnStep1Text: 'Ir para Entrega',
        }),
      );
    });

    it('resets using ReadCommitted isolation level', async () => {
      const plan = makePlan({ product: { name: 'Prod', id: 'prod_1' } });

      prisma.$transaction.mockImplementation(
        async (
          fn: (tx: {
            checkoutProductPlan: { findUnique: jest.Mock };
            checkoutConfig: { update: jest.Mock };
          }) => Promise<unknown>,
        ) => {
          const tx = {
            checkoutProductPlan: {
              findUnique: jest.fn().mockResolvedValue(plan),
            },
            checkoutConfig: {
              update: jest.fn().mockResolvedValue({}),
            },
          };
          return fn(tx);
        },
      );

      await service.resetConfig('plan_1');

      expect(prisma.$transaction).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({ isolationLevel: 'ReadCommitted' }),
      );
    });
  });

  describe('error propagation', () => {
    it('propagates unexpected Prisma errors in calculateShipping', async () => {
      prisma.checkoutProductPlan.findUnique.mockRejectedValue(new Error('DB connection lost'));

      await expect(service.calculateShipping('any', '00000000')).rejects.toThrow(
        'DB connection lost',
      );
    });

    it('propagates unexpected Prisma errors in resetConfig', async () => {
      prisma.$transaction.mockRejectedValue(new Error('Transaction failed'));

      await expect(service.resetConfig('plan_1')).rejects.toThrow('Transaction failed');
    });
  });
});
