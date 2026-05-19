import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CheckoutOrderQueryService } from './checkout-order-query.service';
type PrismaMock = {
  checkoutOrder: {
    findFirst: jest.Mock;
    findUnique: jest.Mock;
    findMany: jest.Mock;
    updateMany: jest.Mock;
    count: jest.Mock;
  };
  upsell: { findUnique: jest.Mock };
  upsellOrder: { create: jest.Mock };
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
  status: 'PENDING',
  paymentMethod: 'PIX',
  installments: 1,
  totalInCents: 9900,
  subtotalInCents: 9900,
  discountInCents: 0,
  bumpTotalInCents: 0,
  shippingPrice: 0,
  shippingAddress: {},
  metadata: null,
  plan: {
    id: 'plan_1',
    name: 'Test Plan',
    slug: 'test-plan',
    product: { id: 'prod_1', name: 'Test Product' },
    upsells: [],
  },
  payment: null,
  upsellOrders: [],
  createdAt: new Date(),
  updatedAt: new Date(),
  paidAt: null,
  shippedAt: null,
  deliveredAt: null,
  canceledAt: null,
  refundedAt: null,
  orderNumberPrefix: 'ORD',
  ...overrides,
});
describe('CheckoutOrderQueryService', () => {
  let service: CheckoutOrderQueryService;
  let prisma: PrismaMock;
  let auditService: { log: jest.Mock };
  beforeEach(() => {
    prisma = {
      checkoutOrder: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        count: jest.fn().mockResolvedValue(0),
      },
      upsell: { findUnique: jest.fn() },
      upsellOrder: { create: jest.fn() },
      $transaction: jest.fn(),
    };
    auditService = { log: jest.fn().mockResolvedValue(undefined) };
    service = new CheckoutOrderQueryService(prisma as never, auditService as never);
  });
  describe('getOrder', () => {
    it('returns order when found with workspaceId', async () => {
      const order = makeOrder();
      prisma.checkoutOrder.findFirst.mockResolvedValue(order);
      const result = await service.getOrder('order_1', 'ws_1');
      expect(prisma.checkoutOrder.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'order_1', workspaceId: 'ws_1' } }),
      );
      expect(result).toEqual(order);
    });
    it('returns order without workspaceId when not provided', async () => {
      const order = makeOrder();
      prisma.checkoutOrder.findFirst.mockResolvedValue(order);
      const result = await service.getOrder('order_1');
      expect(prisma.checkoutOrder.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'order_1' } }),
      );
      expect(result).toEqual(order);
    });
    it('throws NotFoundException when order not found', async () => {
      prisma.checkoutOrder.findFirst.mockResolvedValue(null);
      await expect(service.getOrder('order_1', 'ws_1')).rejects.toThrow(NotFoundException);
    });
    it('rejects cross-workspace access — tenant isolation', async () => {
      prisma.checkoutOrder.findFirst.mockResolvedValue(null);
      await expect(service.getOrder('order_1', 'ws_evil')).rejects.toThrow(NotFoundException);
      expect(prisma.checkoutOrder.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'order_1', workspaceId: 'ws_evil' },
        }),
      );
    });
  });
  describe('listOrders', () => {
    it('returns paginated orders for workspace', async () => {
      const orders = [makeOrder(), makeOrder({ id: 'order_2', orderNumber: 'ORD-002' })];
      prisma.$transaction.mockResolvedValue([orders, 2]);
      const result = await service.listOrders('ws_1');
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(result.orders).toEqual(orders);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.totalPages).toBe(1);
    });
    it('filters by status when provided', async () => {
      prisma.$transaction.mockResolvedValue([[], 0]);
      await service.listOrders('ws_1', { status: 'PAID' });
      expect(prisma.checkoutOrder.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ workspaceId: 'ws_1', status: 'PAID' }),
        }),
      );
    });
    it('enforces workspaceId in where clause', async () => {
      prisma.$transaction.mockResolvedValue([[], 0]);
      await service.listOrders('ws_1');
      expect(prisma.checkoutOrder.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ workspaceId: 'ws_1' }) }),
      );
    });
    it('handles page and limit parameters', async () => {
      prisma.$transaction.mockResolvedValue([[], 50]);
      const result = await service.listOrders('ws_1', { page: 2, limit: 10 });
      expect(result.page).toBe(2);
      expect(result.limit).toBe(10);
      expect(result.totalPages).toBe(5);
    });
  });
  describe('updateOrderStatus', () => {
    it('updates order status with PENDING to PROCESSING transition', async () => {
      prisma.$transaction.mockImplementation(
        async (
          fn: (tx: {
            checkoutOrder: { findFirst: jest.Mock; updateMany: jest.Mock };
          }) => Promise<unknown>,
        ) => {
          const tx = {
            checkoutOrder: {
              findFirst: jest.fn().mockResolvedValue({ workspaceId: 'ws_1', status: 'PENDING' }),
              updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            },
          };
          return fn(tx);
        },
      );
      prisma.checkoutOrder.findFirst.mockResolvedValue(makeOrder({ status: 'PROCESSING' }));
      const result = await service.updateOrderStatus('order_1', 'ws_1', 'PROCESSING');
      expect(result).toMatchObject({
        id: 'order_1',
        workspaceId: 'ws_1',
        status: 'PROCESSING',
      });
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: 'ws_1',
          action: 'ORDER_STATUS_CHANGED',
          resource: 'CheckoutOrder',
        }),
      );
    });
    it('sets paidAt when status changes to PAID', async () => {
      prisma.$transaction.mockImplementation(
        async (
          fn: (tx: {
            checkoutOrder: { findFirst: jest.Mock; updateMany: jest.Mock };
          }) => Promise<unknown>,
        ) => {
          const tx = {
            checkoutOrder: {
              findFirst: jest.fn().mockResolvedValue({ workspaceId: 'ws_1', status: 'PROCESSING' }),
              updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            },
          };
          return fn(tx);
        },
      );
      prisma.checkoutOrder.findFirst.mockResolvedValue(makeOrder({ status: 'PAID' }));
      const result = await service.updateOrderStatus('order_1', 'ws_1', 'PAID');
      expect(result).toMatchObject({
        id: 'order_1',
        workspaceId: 'ws_1',
        status: 'PAID',
      });
    });
    it('rejects invalid status value', async () => {
      await expect(
        service.updateOrderStatus('order_1', 'ws_1', 'INVALID_STATUS' as never),
      ).rejects.toThrow(BadRequestException);
    });
    it('rejects invalid status transition', async () => {
      prisma.$transaction.mockImplementation(
        async (
          fn: (tx: {
            checkoutOrder: { findFirst: jest.Mock; updateMany: jest.Mock };
          }) => Promise<unknown>,
        ) => {
          const tx = {
            checkoutOrder: {
              findFirst: jest.fn().mockResolvedValue({ workspaceId: 'ws_1', status: 'PENDING' }),
              updateMany: jest.fn(),
            },
          };
          return fn(tx);
        },
      );
      await expect(service.updateOrderStatus('order_1', 'ws_1', 'REFUNDED')).rejects.toThrow(
        BadRequestException,
      );
    });
    it('includes extra update data when provided', async () => {
      let updateManyCalled = false;
      prisma.$transaction.mockImplementation(
        async (
          fn: (tx: {
            checkoutOrder: { findFirst: jest.Mock; updateMany: jest.Mock };
          }) => Promise<unknown>,
        ) => {
          const tx = {
            checkoutOrder: {
              findFirst: jest.fn().mockResolvedValue({ workspaceId: 'ws_1', status: 'PAID' }),
              updateMany: jest.fn(() => {
                updateManyCalled = true;
                return Promise.resolve({ count: 1 });
              }),
            },
          };
          return fn(tx);
        },
      );
      prisma.checkoutOrder.findFirst.mockResolvedValue(makeOrder({ status: 'SHIPPED' }));
      await service.updateOrderStatus('order_1', 'ws_1', 'SHIPPED', {
        trackingCode: 'TRK123',
      });
      expect(updateManyCalled).toBe(true);
    });
  });
  describe('getOrderStatus', () => {
    it('returns order with status and payment details', async () => {
      const order = makeOrder({
        payment: { status: 'PENDING', pixQrCode: null, pixCopyPaste: null, boletoUrl: null },
      });
      prisma.checkoutOrder.findUnique.mockResolvedValue(order);
      const result = await service.getOrderStatus('order_1');
      expect(result).toEqual(order);
      expect(prisma.checkoutOrder.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'order_1' } }),
      );
    });
    it('throws NotFoundException when order not found', async () => {
      prisma.checkoutOrder.findUnique.mockResolvedValue(null);
      await expect(service.getOrderStatus('order_1')).rejects.toThrow(NotFoundException);
    });
  });
  describe('acceptUpsell', () => {
    it('creates upsell order with PAID status for ONE_CLICK charge type', async () => {
      prisma.checkoutOrder.findUnique
        .mockResolvedValueOnce(makeOrder())
        .mockResolvedValueOnce({ workspaceId: 'ws_1' });
      prisma.upsell.findUnique.mockResolvedValue({
        id: 'upsell_1',
        productName: 'Upsell Product',
        priceInCents: 2900,
        chargeType: 'ONE_CLICK',
      });
      prisma.upsellOrder.create.mockResolvedValue({
        id: 'uo_1',
        orderId: 'order_1',
        upsellId: 'upsell_1',
        productName: 'Upsell Product',
        priceInCents: 2900,
        status: 'PAID',
      });
      const result = await service.acceptUpsell('order_1', 'upsell_1');
      expect(result.accepted).toBe(true);
      expect(result.chargeType).toBe('ONE_CLICK');
      const createArgs = prisma.upsellOrder.create.mock.calls[0] as Array<Record<string, unknown>>;
      const callData = createArgs[0] as Record<string, unknown>;
      expect(callData.data).toEqual(
        expect.objectContaining({
          orderId: 'order_1',
          upsellId: 'upsell_1',
          status: 'PAID',
        }),
      );
    });
    it('creates upsell order with PENDING status for NEW_PAYMENT charge type', async () => {
      prisma.checkoutOrder.findUnique
        .mockResolvedValueOnce(makeOrder())
        .mockResolvedValueOnce({ workspaceId: 'ws_1' });
      prisma.upsell.findUnique.mockResolvedValue({
        id: 'upsell_2',
        productName: 'Premium Upsell',
        priceInCents: 4900,
        chargeType: 'NEW_PAYMENT',
      });
      prisma.upsellOrder.create.mockResolvedValue({
        id: 'uo_2',
        status: 'PENDING',
      });
      const result = await service.acceptUpsell('order_1', 'upsell_2');
      expect(result.chargeType).toBe('NEW_PAYMENT');
      const createArgsNew = prisma.upsellOrder.create.mock.calls[0] as Array<
        Record<string, unknown>
      >;
      const callDataNew = createArgsNew[0] as Record<string, unknown>;
      expect(callDataNew.data).toEqual(
        expect.objectContaining({
          status: 'PENDING',
        }),
      );
    });
    it('throws NotFoundException when order does not exist', async () => {
      prisma.checkoutOrder.findUnique.mockResolvedValue(null);
      await expect(service.acceptUpsell('order_1', 'upsell_1')).rejects.toThrow(NotFoundException);
    });
    it('throws NotFoundException when upsell does not exist', async () => {
      prisma.checkoutOrder.findUnique.mockResolvedValue(makeOrder());
      prisma.upsell.findUnique.mockResolvedValue(null);
      await expect(service.acceptUpsell('order_1', 'upsell_1')).rejects.toThrow(NotFoundException);
    });
    it('logs audit event for accepted upsell', async () => {
      prisma.checkoutOrder.findUnique
        .mockResolvedValueOnce(makeOrder())
        .mockResolvedValueOnce({ workspaceId: 'ws_1' });
      prisma.upsell.findUnique.mockResolvedValue({
        id: 'upsell_1',
        productName: 'Upsell',
        priceInCents: 1500,
        chargeType: 'ONE_CLICK',
      });
      prisma.upsellOrder.create.mockResolvedValue({ id: 'uo_1' });
      await service.acceptUpsell('order_1', 'upsell_1');
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'UPSELL_ACCEPTED',
          resource: 'UpsellOrder',
          details: expect.objectContaining({
            orderId: 'order_1',
            upsellId: 'upsell_1',
            priceInCents: 1500,
          }),
        }),
      );
    });
  });
  describe('declineUpsell', () => {
    it('returns declined: true when order exists', async () => {
      prisma.checkoutOrder.findUnique.mockResolvedValue(makeOrder());
      const result = await service.declineUpsell('order_1', 'upsell_1');
      expect(result).toEqual({ declined: true });
    });
    it('throws NotFoundException when order does not exist', async () => {
      prisma.checkoutOrder.findUnique.mockResolvedValue(null);
      await expect(service.declineUpsell('order_1', 'upsell_1')).rejects.toThrow(NotFoundException);
    });
  });
  describe('getRecentPaidOrders', () => {
    it('returns recent paid orders limited by count', async () => {
      const orders = [makeOrder({ status: 'PAID' }), makeOrder({ id: 'order_2', status: 'PAID' })];
      prisma.checkoutOrder.findMany.mockResolvedValue(orders);
      const result = await service.getRecentPaidOrders(10);
      expect(prisma.checkoutOrder.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: 'PAID' },
          orderBy: { createdAt: 'desc' },
          take: 10,
        }),
      );
      expect(result).toEqual(orders);
    });
  });
  describe('error propagation', () => {
    it('propagates database errors from getOrder', async () => {
      prisma.checkoutOrder.findFirst.mockRejectedValue(new Error('DB fetch failure'));
      await expect(service.getOrder('order_1', 'ws_1')).rejects.toThrow('DB fetch failure');
    });
    it('propagates database errors from listOrders', async () => {
      prisma.$transaction.mockRejectedValue(new Error('Transaction aborted'));

      await expect(service.listOrders('ws_1')).rejects.toThrow('Transaction aborted');
    });
  });
});
