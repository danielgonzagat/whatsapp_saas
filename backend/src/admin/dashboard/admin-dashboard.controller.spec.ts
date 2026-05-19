import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AdminDashboardController } from './admin-dashboard.controller';
import { AdminHomeCompareDto, AdminHomePeriodDto, ListHomeQueryDto } from './dto/list-home.dto';
import { AdminAuthGuard } from '../auth/guards/admin-auth.guard';

describe('AdminDashboardController', () => {
  const dashboard = {
    getHome: jest.fn(),
  };

  let controller: AdminDashboardController;

  const mockHomeResponse = {
    range: {
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-01-31T00:00:00.000Z',
      label: 'Jan 2026',
      period: '30D' as const,
      compare: 'PREVIOUS' as const,
    },
    compare: {
      from: '2025-12-01T00:00:00.000Z',
      to: '2025-12-31T00:00:00.000Z',
    },
    kpis: {
      gmv: { value: 1500000, previous: 1200000, deltaPct: 25 },
      approvedCount: { value: 42, previous: 35, deltaPct: 20 },
      declinedCount: { value: 3, previous: 2, deltaPct: 50 },
      pendingCount: { value: 5, previous: 4, deltaPct: 25 },
      approvalRate: { value: 0.93, previous: 0.95, deltaPct: -2.1 },
      refundCount: { value: 2, previous: 1, deltaPct: 100 },
      refundAmount: { value: 50000, previous: 30000, deltaPct: 66.7 },
      chargebackCount: { value: 0, previous: 0, deltaPct: 0 },
      chargebackAmount: { value: 0, previous: 0, deltaPct: 0 },
      averageTicket: { value: 35714, previous: 34285, deltaPct: 4.2 },
      activeProducers: { value: 18, windowDays: 30 },
      newProducers: { value: 3, previous: 2, deltaPct: 50 },
      totalProducers: { value: 150 },
      revenueKloel: { value: 150000, previous: 120000, deltaPct: 25 },
      revenueKloelRate: { value: 0.1, previous: 0.1, deltaPct: 0 },
      mrrProjected: { value: 85000, previous: 78000, deltaPct: 8.97 },
      churnRate: { value: 0.02, previous: 0.03, deltaPct: -33.3 },
      conversations: { value: 230, previous: 180, deltaPct: 27.8 },
      responseTimeMinutes: { value: 12, previous: 15, deltaPct: -20 },
    },
    breakdowns: {
      byGateway: [],
      byMethod: [],
    },
    series: {
      gmvDaily: [],
      previousGmvDaily: [],
      revenueKloelDaily: [],
      previousRevenueKloelDaily: [],
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    dashboard.getHome.mockResolvedValue(mockHomeResponse);
    controller = new AdminDashboardController(dashboard as never);
  });

  describe('GET admin/dashboard/home', () => {
    it('calls service.getHome and returns aggregated metrics shape', async () => {
      const query = { period: AdminHomePeriodDto.D30 } as ListHomeQueryDto;

      const result = await controller.home(query);

      expect(dashboard.getHome).toHaveBeenCalledTimes(1);
      expect(dashboard.getHome).toHaveBeenCalledWith(
        AdminHomePeriodDto.D30,
        AdminHomeCompareDto.PREVIOUS,
        undefined,
        undefined,
      );
      expect(result).toEqual(mockHomeResponse);
      expect(result.range).toBeDefined();
      expect(result.kpis).toBeDefined();
      expect(result.breakdowns).toBeDefined();
      expect(result.series).toBeDefined();
    });

    it('passes timeRange via from/to dates to service', async () => {
      const from = new Date('2026-05-01T00:00:00.000Z');
      const to = new Date('2026-05-10T00:00:00.000Z');
      const query = {
        period: AdminHomePeriodDto.CUSTOM,
        from,
        to,
      } as ListHomeQueryDto;

      await controller.home(query);

      expect(dashboard.getHome).toHaveBeenCalledWith(
        AdminHomePeriodDto.CUSTOM,
        AdminHomeCompareDto.PREVIOUS,
        from,
        to,
      );
    });

    it('propagates service rejection as HTTP error', async () => {
      const error = new Error('Database connection lost');
      dashboard.getHome.mockRejectedValue(error);
      const query = { period: AdminHomePeriodDto.D30 } as ListHomeQueryDto;

      await expect(controller.home(query)).rejects.toThrow('Database connection lost');
    });

    it('enforces admin identity via AdminAuthGuard at controller level', () => {
      const guards: Array<{ new (...args: unknown[]): unknown }> = Reflect.getMetadata(
        GUARDS_METADATA,
        AdminDashboardController,
      );

      expect(guards).toBeDefined();
      expect(guards.length).toBeGreaterThanOrEqual(1);
      expect(guards.some((g) => g === AdminAuthGuard)).toBe(true);
    });
  });
});
