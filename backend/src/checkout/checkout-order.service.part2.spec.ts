import { BadRequestException } from '@nestjs/common';
import { CheckoutOrderService } from './checkout-order.service';
import { castMock } from '../../test/helpers/cast-mock';
import { partialMatch } from '../../test/helpers/match-instance';

type TxOrderClient = {
  findFirst: jest.Mock;
  create: jest.Mock;
};

type PrismaMock = {
  checkoutOrder: {
    findFirst: jest.Mock;
    findMany: jest.Mock;
    findUnique: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
    count: jest.Mock;
  };
  checkoutProductPlan: { findUnique: jest.Mock };
  checkoutCoupon: { updateMany: jest.Mock };
  affiliateLink: { findFirst: jest.Mock };
  marketplaceFee: { findMany: jest.Mock };
  contact: { findFirst: jest.Mock };
  $transaction: jest.Mock;
};

const PLAN_PRICE_IN_CENTS = 9900;

const makePlanRecord = (overrides: Record<string, unknown> = {}) => ({
  id: 'plan_1',
  slug: 'test-plan',
  name: 'Test Plan',
  priceInCents: PLAN_PRICE_IN_CENTS,
  currency: 'BRL',
  quantity: 1,
  isActive: true,
  productId: 'prod_1',
  product: {
    id: 'prod_1',
    workspaceId: 'ws_1',
    name: 'Test Product',
    description: 'Desc',
    category: 'DIGITAL',
    format: 'DIGITAL',
    images: [],
    imageUrl: null,
    commissionPercent: 0,
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
  ...overrides,
});

const makeStoredOrder = (overrides: Record<string, unknown> = {}) => ({
  id: 'order_1',
  workspaceId: 'ws_1',
  planId: 'plan_1',
  orderNumber: 'ORD-001',
  status: 'PENDING',
  paymentMethod: 'PIX',
  installments: 1,
  totalInCents: PLAN_PRICE_IN_CENTS,
  subtotalInCents: PLAN_PRICE_IN_CENTS,
  discountInCents: 0,
  bumpTotalInCents: 0,
  payment: null,
  plan: { product: { id: 'prod_1' }, upsells: [] },
  createdAt: new Date('2026-05-01T00:00:00.000Z'),
  ...overrides,
});

describe('CheckoutOrderService lifecycle (createOrder + updateTracking)', () => {
  let service: CheckoutOrderService;
  let prisma: PrismaMock;
  let paymentService: { processPayment: jest.Mock };
  let catalogService: { validateCoupon: jest.Mock };
  let eventEmitter: { cartCreated: jest.Mock; checkoutInitiated: jest.Mock };

  const baseInput = {
    planId: 'plan_1',
    workspaceId: 'ws_1',
    correlationId: 'corr_test_1',
    customerName: 'Test Customer',
    customerEmail: 'test@example.com',
    customerCPF: '12345678901',
    customerPhone: '11999999999',
    shippingAddress: { cep: '04538000' } as never,
    subtotalInCents: PLAN_PRICE_IN_CENTS,
    totalInCents: PLAN_PRICE_IN_CENTS,
    paymentMethod: 'PIX' as const,
    installments: 1,
  };

  beforeEach(() => {
    prisma = {
      checkoutOrder: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        count: jest.fn().mockResolvedValue(0),
      },
      checkoutProductPlan: { findUnique: jest.fn() },
      checkoutCoupon: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      affiliateLink: { findFirst: jest.fn().mockResolvedValue(null) },
      marketplaceFee: { findMany: jest.fn().mockResolvedValue([]) },
      contact: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(),
    };
    paymentService = {
      processPayment: jest.fn().mockResolvedValue({ status: 'PENDING', pixQrCode: 'qr' }),
    };
    catalogService = { validateCoupon: jest.fn() };
    eventEmitter = {
      cartCreated: jest.fn().mockResolvedValue(undefined),
      checkoutInitiated: jest.fn().mockResolvedValue(undefined),
    };

    service = new CheckoutOrderService(
      castMock(prisma),
      castMock(paymentService),
      castMock(catalogService),
      castMock({}),
      castMock(eventEmitter),
    );
  });

  /** Wire $transaction(fn) to a tx client; expose the captured create mock. */
  const wireCreateTransaction = (existing: unknown, created: unknown): TxOrderClient => {
    const tx: TxOrderClient = {
      findFirst: jest.fn().mockResolvedValue(existing),
      create: jest.fn().mockResolvedValue(created),
    };
    prisma.$transaction.mockImplementation(
      async (fn: (client: { checkoutOrder: TxOrderClient }) => Promise<unknown>) =>
        fn({ checkoutOrder: tx }),
    );
    return tx;
  };

  /** First persisted `create({ data })` payload from a tx client. */
  const firstCreateData = (tx: TxOrderClient): Record<string, unknown> => {
    const calls = castMock<Array<[{ data: Record<string, unknown> }]>>(tx.create.mock.calls);
    return calls[0][0].data;
  };

  describe('createOrder — server-side amount reconciliation', () => {
    it('persists server-calculated bigint cents and ignores inflated client totals', async () => {
      prisma.checkoutProductPlan.findUnique.mockResolvedValue(makePlanRecord());
      const tx = wireCreateTransaction(null, makeStoredOrder({ totalInCents: 19800 }));

      // Client claims qty 2 should cost only 100 cents; server must override.
      await service.createOrder({
        ...baseInput,
        orderQuantity: 2,
        subtotalInCents: 1,
        totalInCents: 100,
      });

      const persisted = firstCreateData(tx);
      // 9900 * 2, no shipping/discount/bumps.
      expect(persisted.subtotalInCents).toBe(19800);
      expect(persisted.totalInCents).toBe(19800);
      expect(persisted.discountInCents).toBe(0);
      expect(persisted.bumpTotalInCents).toBe(0);
      // Integer cents, never a fractional float.
      expect(Number.isInteger(persisted.totalInCents)).toBe(true);
    });

    it('forwards the server total (not the client total) to payment processing', async () => {
      prisma.checkoutProductPlan.findUnique.mockResolvedValue(makePlanRecord());
      wireCreateTransaction(null, makeStoredOrder());

      await service.createOrder({ ...baseInput, totalInCents: 1 });

      expect(paymentService.processPayment).toHaveBeenCalledWith(
        partialMatch({ totalInCents: PLAN_PRICE_IN_CENTS, idempotencyKey: 'order_1' }),
      );
    });

    it('emits cart + checkout events with the server-side total', async () => {
      prisma.checkoutProductPlan.findUnique.mockResolvedValue(makePlanRecord());
      wireCreateTransaction(null, makeStoredOrder());

      await service.createOrder({ ...baseInput, totalInCents: 1 });

      expect(eventEmitter.cartCreated).toHaveBeenCalledWith(
        partialMatch({
          workspaceId: 'ws_1',
          orderId: 'order_1',
          totalInCents: PLAN_PRICE_IN_CENTS,
        }),
      );
      expect(eventEmitter.checkoutInitiated).toHaveBeenCalledWith(
        partialMatch({ orderId: 'order_1', totalInCents: PLAN_PRICE_IN_CENTS }),
      );
    });
  });

  describe('createOrder — idempotency (replay protection)', () => {
    it('returns the existing order without creating a duplicate on correlationId replay', async () => {
      prisma.checkoutProductPlan.findUnique.mockResolvedValue(makePlanRecord());
      const existing = makeStoredOrder({ id: 'order_existing', orderNumber: 'ORD-OLD' });
      const tx = wireCreateTransaction(existing, makeStoredOrder());

      const result = await service.createOrder(baseInput);

      expect(tx.create).not.toHaveBeenCalled();
      expect(castMock<{ id: string }>(result).id).toBe('order_existing');
      // No second cart should be created on a replay.
      expect(eventEmitter.cartCreated).not.toHaveBeenCalled();
    });

    it('scopes the idempotency lookup to the workspace (tenant isolation)', async () => {
      prisma.checkoutProductPlan.findUnique.mockResolvedValue(makePlanRecord());
      const tx = wireCreateTransaction(null, makeStoredOrder());

      await service.createOrder(baseInput);

      expect(tx.findFirst).toHaveBeenCalledWith(
        partialMatch({
          where: partialMatch({ workspaceId: 'ws_1' }),
        }),
      );
    });

    it('uses a ReadCommitted transaction to guard concurrent create', async () => {
      prisma.checkoutProductPlan.findUnique.mockResolvedValue(makePlanRecord());
      wireCreateTransaction(null, makeStoredOrder());

      await service.createOrder(baseInput);

      const txCalls = castMock<Array<[unknown, { isolationLevel: string }]>>(
        prisma.$transaction.mock.calls,
      );
      expect(txCalls[0][1].isolationLevel).toBe('ReadCommitted');
    });
  });

  describe('createOrder — coupon validation', () => {
    it('rejects an invalid coupon before the order is created', async () => {
      prisma.checkoutProductPlan.findUnique.mockResolvedValue(makePlanRecord());
      catalogService.validateCoupon.mockResolvedValue({
        valid: false,
        message: 'Cupom inválido ou expirado.',
      });

      await expect(
        service.createOrder({ ...baseInput, couponCode: 'EXPIRED' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('applies a valid coupon discount to the persisted total', async () => {
      prisma.checkoutProductPlan.findUnique.mockResolvedValue(makePlanRecord());
      catalogService.validateCoupon.mockResolvedValue({ valid: true, discountAmount: 1000 });
      const tx = wireCreateTransaction(null, makeStoredOrder({ totalInCents: 8900 }));

      await service.createOrder({ ...baseInput, couponCode: 'save10' });

      const persisted = firstCreateData(tx);
      // 9900 - 1000 discount.
      expect(persisted.totalInCents).toBe(8900);
      expect(persisted.discountInCents).toBe(1000);
      // Coupon code is normalized to upper-case on persistence.
      expect(persisted.couponCode).toBe('SAVE10');
      // Coupon usage is incremented after the order is processed.
      expect(prisma.checkoutCoupon.updateMany).toHaveBeenCalledWith(
        partialMatch({
          where: partialMatch({ workspaceId: 'ws_1', code: 'SAVE10' }),
          data: { usedCount: { increment: 1 } },
        }),
      );
    });
  });

  describe('createOrder — workspace isolation on the plan', () => {
    it('rejects a plan that belongs to another workspace', async () => {
      prisma.checkoutProductPlan.findUnique.mockResolvedValue(
        makePlanRecord({
          product: {
            id: 'prod_1',
            workspaceId: 'ws_other',
            name: 'Foreign',
            images: [],
            commissionPercent: 0,
          },
        }),
      );

      await expect(service.createOrder(baseInput)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('updateTracking — workspace-scoped management write', () => {
    it('verifies workspace ownership before persisting tracking', async () => {
      prisma.checkoutOrder.findFirst.mockResolvedValue({ id: 'order_1' });

      const result = await service.updateTracking('ws_1', {
        orderId: 'order_1',
        trackingCode: 'TRK123',
        trackingUrl: 'https://track/TRK123',
      });

      expect(prisma.checkoutOrder.findFirst).toHaveBeenCalledWith(
        partialMatch({ where: { id: 'order_1', workspaceId: 'ws_1' } }),
      );
      expect(prisma.checkoutOrder.update).toHaveBeenCalledWith(
        partialMatch({
          where: { id: 'order_1' },
          data: partialMatch({ trackingCode: 'TRK123', trackingUrl: 'https://track/TRK123' }),
        }),
      );
      expect(result).toEqual({ success: true, orderId: 'order_1', trackingCode: 'TRK123' });
    });

    it('refuses a cross-tenant order and never writes', async () => {
      prisma.checkoutOrder.findFirst.mockResolvedValue(null);

      await expect(
        service.updateTracking('ws_evil', { orderId: 'order_1', trackingCode: 'TRK123' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.checkoutOrder.update).not.toHaveBeenCalled();
    });

    it('rejects missing orderId or trackingCode', async () => {
      await expect(
        service.updateTracking('ws_1', { trackingCode: 'TRK123' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.updateTracking('ws_1', { orderId: 'order_1' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.checkoutOrder.findFirst).not.toHaveBeenCalled();
    });
  });
});
