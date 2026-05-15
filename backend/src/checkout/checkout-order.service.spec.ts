import { BadRequestException } from '@nestjs/common';
import { CheckoutOrderService } from './checkout-order.service';

type PrismaMock = {
  checkoutOrder: {
    findFirst: jest.Mock;
    findMany: jest.Mock;
    findUnique: jest.Mock;
    create: jest.Mock;
    updateMany: jest.Mock;
    count: jest.Mock;
  };
  checkoutProductPlan: {
    findUnique: jest.Mock;
    findFirst: jest.Mock;
  };
  affiliateLink: {
    findFirst: jest.Mock;
  };
  checkoutCoupon: {
    findUnique: jest.Mock;
  };
  checkoutConfig: {
    findUnique: jest.Mock;
  };
  orderBump: {
    findMany: jest.Mock;
  };
  upsell: {
    findMany: jest.Mock;
    findUnique: jest.Mock;
  };
  upsellOrder: {
    create: jest.Mock;
  };
  marketplaceFee: {
    findMany: jest.Mock;
  };
  contact: {
    findFirst: jest.Mock;
  };
  $transaction: jest.Mock;
};

const makeOrder = (overrides: Record<string, unknown> = {}) => ({
  id: 'order_1',
  workspaceId: 'ws_1',
  planId: 'plan_1',
  orderNumber: 'ORD-001',
  customerName: 'Test Customer',
  customerEmail: 'test@example.com',
  customerCPF: '12345678901',
  customerPhone: '11999999999',
  shippingAddress: { cep: '04538000' },
  shippingMethod: null,
  shippingPrice: 0,
  subtotalInCents: 9900,
  discountInCents: 0,
  bumpTotalInCents: 0,
  totalInCents: 9900,
  couponCode: null,
  couponDiscount: null,
  acceptedBumps: [],
  paymentMethod: 'PIX',
  installments: 1,
  status: 'PENDING',
  payment: null,
  upsellOrders: [],
  metadata: null,
  plan: {
    id: 'plan_1',
    name: 'Test Plan',
    slug: 'test-plan',
    product: { id: 'prod_1', name: 'Test Product', workspaceId: 'ws_1' },
    priceInCents: 9900,
    quantity: 1,
    freeShipping: false,
    shippingPrice: null,
    checkoutConfig: {
      id: 'cfg_1',
      planId: 'plan_1',
      shippingMode: null,
      shippingOriginZip: null,
      shippingVariableMinInCents: null,
      shippingVariableMaxInCents: null,
      shippingUseKloelCalculator: false,
    },
    orderBumps: [],
    upsells: [],
  },
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('CheckoutOrderService', () => {
  let service: CheckoutOrderService;
  let prisma: PrismaMock;
  let paymentService: { processPayment: jest.Mock; createStripeCheckoutSession: jest.Mock };
  let catalogService: { validateCoupon: jest.Mock };
  let queryService: {
    getOrder: jest.Mock;
    listOrders: jest.Mock;
    updateOrderStatus: jest.Mock;
    getOrderStatus: jest.Mock;
    acceptUpsell: jest.Mock;
    declineUpsell: jest.Mock;
    getRecentPaidOrders: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      checkoutOrder: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        count: jest.fn().mockResolvedValue(0),
      },
      checkoutProductPlan: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
      },
      affiliateLink: { findFirst: jest.fn().mockResolvedValue(null) },
      checkoutCoupon: { findUnique: jest.fn().mockResolvedValue(null) },
      checkoutConfig: { findUnique: jest.fn() },
      orderBump: { findMany: jest.fn().mockResolvedValue([]) },
      upsell: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn() },
      upsellOrder: { create: jest.fn() },
      marketplaceFee: { findMany: jest.fn().mockResolvedValue([]) },
      contact: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(),
    };
    paymentService = {
      processPayment: jest.fn(),
      createStripeCheckoutSession: jest.fn(),
    };
    catalogService = { validateCoupon: jest.fn() };
    queryService = {
      getOrder: jest.fn(),
      listOrders: jest.fn(),
      updateOrderStatus: jest.fn(),
      getOrderStatus: jest.fn(),
      acceptUpsell: jest.fn(),
      declineUpsell: jest.fn(),
      getRecentPaidOrders: jest.fn(),
    };

    service = new CheckoutOrderService(
      prisma as never,
      paymentService as never,
      catalogService as never,
      queryService as never,
    );
  });

  describe('createOrder', () => {
    const baseCreateOrderInput = {
      planId: 'plan_1',
      workspaceId: 'ws_1',
      correlationId: 'corr_test_1',
      customerName: 'Test Customer',
      customerEmail: 'test@example.com',
      customerCPF: '12345678901',
      customerPhone: '11999999999',
      shippingAddress: { cep: '04538000' } as never,
      subtotalInCents: 9900,
      totalInCents: 9900,
      paymentMethod: 'PIX' as const,
      installments: 1,
    };

    it('creates order successfully with server-side pricing reconciliation', async () => {
      const planRecord = {
        id: 'plan_1',
        slug: 'test-plan',
        name: 'Test Plan',
        priceInCents: 9900,
        currency: 'BRL',
        maxInstallments: 12,
        installmentsFee: false,
        freeShipping: false,
        shippingPrice: null,
        quantity: 1,
        isActive: true,
        kind: 'PLAN',
        legacyCheckoutEnabled: false,
        productId: 'prod_1',
        product: {
          id: 'prod_1',
          workspaceId: 'ws_1',
          name: 'Test Product',
          description: 'Desc',
          category: 'DIGITAL',
          format: 'DIGITAL',
          images: [],
        },
        checkoutConfig: {
          id: 'cfg_1',
          planId: 'plan_1',
          shippingMode: null,
          shippingOriginZip: null,
          shippingVariableMinInCents: null,
          shippingVariableMaxInCents: null,
          shippingUseKloelCalculator: false,
        },
        orderBumps: [],
        upsells: [],
      };

      prisma.checkoutProductPlan.findUnique.mockResolvedValue(planRecord);
      prisma.checkoutProductPlan.findFirst.mockResolvedValue(null);
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

      const createdOrder = makeOrder();
      prisma.$transaction.mockImplementation(
        async (fn: (tx: Record<string, unknown>) => Promise<unknown>) => {
          const tx = {
            checkoutOrder: {
              findFirst: jest.fn().mockResolvedValue(null),
              create: jest.fn().mockResolvedValue(createdOrder),
            },
          };
          return fn(tx);
        },
      );

      paymentService.processPayment = jest.fn().mockResolvedValue({
        status: 'PENDING',
        pixQrCode: 'qr-code',
        pixCopyPaste: 'copy-paste-text',
      });

      const result = await service.createOrder(baseCreateOrderInput);

      expect(result).toMatchObject({
        id: 'order_1',
        workspaceId: 'ws_1',
        orderNumber: 'ORD-001',
        status: 'PENDING',
      });
      expect(prisma.$transaction).toHaveBeenCalled();
    });
  });
});
