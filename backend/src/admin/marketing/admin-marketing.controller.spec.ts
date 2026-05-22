import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AdminMarketingController } from './admin-marketing.controller';
import { AdminHomePeriodDto, ListHomeQueryDto } from '../dashboard/dto/list-home.dto';
import { AdminAuthGuard } from '../auth/guards/admin-auth.guard';

describe('AdminMarketingController', () => {
  const marketing = {
    overview: jest.fn(),
  };

  let controller: AdminMarketingController;

  const mockOverviewResponse = {
    range: {
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-01-31T00:00:00.000Z',
      label: 'Jan 2026',
      period: '30D' as const,
    },
    hero: {
      revenueKloelInCents: 150000,
      messages: 230,
      leads: 45,
      approvedOrders: 42,
    },
    channels: [],
    topProducts: [],
    ai: {
      activeConversations: 230,
      trackedProducts: 0,
      approvedOrders: 42,
    },
    rankings: [],
    feed: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    marketing.overview.mockResolvedValue(mockOverviewResponse);
    controller = new AdminMarketingController(marketing as never);
  });

  describe('GET admin/marketing/overview', () => {
    it('calls marketing.overview with period and returns overview data', async () => {
      const query = { period: AdminHomePeriodDto.D30 } as ListHomeQueryDto;

      const result = await controller.overview(query);

      expect(marketing.overview).toHaveBeenCalledTimes(1);
      expect(marketing.overview).toHaveBeenCalledWith(AdminHomePeriodDto.D30, undefined, undefined);
      expect(result).toEqual(mockOverviewResponse);
      expect(result.hero).toBeDefined();
      expect(result.channels).toBeDefined();
      expect(result.rankings).toBeDefined();
      expect(result.feed).toBeDefined();
    });

    it('passes DTO from/to dates to the service', async () => {
      const from = new Date('2026-05-01T00:00:00.000Z');
      const to = new Date('2026-05-10T00:00:00.000Z');
      const query = {
        period: AdminHomePeriodDto.CUSTOM,
        from,
        to,
      } as ListHomeQueryDto;

      await controller.overview(query);

      expect(marketing.overview).toHaveBeenCalledWith(AdminHomePeriodDto.CUSTOM, from, to);
    });

    it('propagates service rejection as rejected promise', async () => {
      const error = new Error('Database connection lost');
      marketing.overview.mockRejectedValue(error);
      const query = { period: AdminHomePeriodDto.D30 } as ListHomeQueryDto;

      await expect(controller.overview(query)).rejects.toThrow('Database connection lost');
    });

    it('enforces admin identity via AdminAuthGuard at controller level', () => {
      const guards: Array<{ new (...args: unknown[]): unknown }> = Reflect.getMetadata(
        GUARDS_METADATA,
        AdminMarketingController,
      );

      expect(guards).toBeDefined();
      expect(guards.length).toBeGreaterThanOrEqual(1);
      expect(guards.some((g) => g === AdminAuthGuard)).toBe(true);
    });
  });
});
