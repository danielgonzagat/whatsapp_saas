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

  describe('delegation to CheckoutOrderQueryService', () => {
    it('getOrder delegates to queryService.getOrder', async () => {
      const order = makeOrder();
      queryService.getOrder.mockResolvedValue(order);

      const result = await service.getOrder('order_1', 'ws_1');

      expect(queryService.getOrder).toHaveBeenCalledWith('order_1', 'ws_1');
      expect(result).toEqual(order);
    });

    it('listOrders delegates to queryService.listOrders', async () => {
      const pageResult = { orders: [], total: 0, page: 1, limit: 20, totalPages: 0 };
      queryService.listOrders.mockResolvedValue(pageResult);

      const result = await service.listOrders('ws_1', { status: 'PAID', page: 1, limit: 20 });

      expect(queryService.listOrders).toHaveBeenCalledWith('ws_1', {
        status: 'PAID',
        page: 1,
        limit: 20,
      });
      expect(result).toEqual(pageResult);
    });

    it('updateOrderStatus delegates to queryService.updateOrderStatus', async () => {
      const updated = makeOrder({ status: 'PROCESSING' });
      queryService.updateOrderStatus.mockResolvedValue(updated);

      const result = await service.updateOrderStatus('order_1', 'ws_1', 'PROCESSING');

      expect(queryService.updateOrderStatus).toHaveBeenCalledWith(
        'order_1',
        'ws_1',
        'PROCESSING',
        undefined,
      );
      expect(result).toEqual(updated);
    });

    it('getOrderStatus delegates to queryService.getOrderStatus', async () => {
      const orderStatus = makeOrder();
      queryService.getOrderStatus.mockResolvedValue(orderStatus);

      const result = await service.getOrderStatus('order_1');

      expect(queryService.getOrderStatus).toHaveBeenCalledWith('order_1');
      expect(result).toEqual(orderStatus);
    });

    it('acceptUpsell delegates to queryService.acceptUpsell', async () => {
      queryService.acceptUpsell.mockResolvedValue({
        accepted: true,
        upsellOrder: { id: 'uo_1' },
        chargeType: 'ONE_CLICK',
      });

      const result = await service.acceptUpsell('order_1', 'upsell_1');

      expect(queryService.acceptUpsell).toHaveBeenCalledWith('order_1', 'upsell_1');
      expect(result.accepted).toBe(true);
    });

    it('declineUpsell delegates to queryService.declineUpsell', async () => {
      queryService.declineUpsell.mockResolvedValue({ declined: true });

      const result = await service.declineUpsell('order_1', 'upsell_1');

      expect(queryService.declineUpsell).toHaveBeenCalledWith('order_1', 'upsell_1');
      expect(result).toEqual({ declined: true });
    });

    it('getRecentPaidOrders delegates to queryService.getRecentPaidOrders', async () => {
      const orders = [makeOrder({ status: 'PAID' })];
      queryService.getRecentPaidOrders.mockResolvedValue(orders);

      const result = await service.getRecentPaidOrders(5);

      expect(queryService.getRecentPaidOrders).toHaveBeenCalledWith(5);
      expect(result).toEqual(orders);
    });
  });
});
