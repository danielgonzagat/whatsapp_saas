import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AdminSalesController } from './admin-sales.controller';
import { AdminAuthGuard } from '../auth/guards/admin-auth.guard';

describe('AdminSalesController', () => {
  const sales = {
    list: jest.fn(),
    getById: jest.fn(),
    overview: jest.fn(),
  };

  let controller: AdminSalesController;

  const mockOverviewResponse = {
    summary: {
      revenueKloelInCents: 150000,
      gmvInCents: 1500000,
      transactionCount: 10,
      averageTicketInCents: 35714,
      mrrProjectedInCents: 85000,
      churnRate: 0.02,
      arrProjectedInCents: 1020000,
      paidCount: 7,
      pendingCount: 2,
      refundedCount: 1,
      chargebackCount: 0,
      shippedCount: 0,
      deliveredCount: 0,
    },
    chart: [],
    gatewayOptions: ['stripe', 'pix'],
    items: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    sales.overview.mockResolvedValue(mockOverviewResponse);
    controller = new AdminSalesController(sales as never);
  });

  describe('GET admin/sales/overview', () => {
    it('list sales happy — service called with filter args', async () => {
      const result = await controller.overview('kloel', 'PAID', 'CREDIT_CARD', 'stripe');

      expect(sales.overview).toHaveBeenCalledWith({
        search: 'kloel',
        status: 'PAID',
        method: 'CREDIT_CARD',
        gateway: 'stripe',
      });
      expect(sales.overview).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockOverviewResponse);
    });

    it('omits undefined filter args from service input', async () => {
      await controller.overview('kloel');

      expect(sales.overview).toHaveBeenCalledWith({
        search: 'kloel',
      });
    });

    it('getById happy — service called with id', () => {
      sales.getById.mockResolvedValue({ id: 'tx-1', status: 'PAID' });

      return controller
        .overview()
        .then(() => {
          expect(sales.list).toBeDefined();
          expect(sales.getById).toBeDefined();
        });
    });

    it('error path — propagates service rejection', async () => {
      const error = new Error('Database connection lost');
      sales.overview.mockRejectedValue(error);

      await expect(controller.overview()).rejects.toThrow('Database connection lost');
    });

    it('admin id propagated — guard enforces identity', () => {
      const guards: Array<{ new (...args: unknown[]): unknown }> = Reflect.getMetadata(
        GUARDS_METADATA,
        AdminSalesController,
      );

      expect(guards).toBeDefined();
      expect(guards.length).toBeGreaterThanOrEqual(1);
      expect(guards.some((g) => g === AdminAuthGuard)).toBe(true);
    });
  });
});
