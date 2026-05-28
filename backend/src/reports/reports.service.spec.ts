import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ReportsOrdersService } from './reports-orders.service';
import { ReportsAffiliateService } from './reports-affiliate.service';
import { ReportsService } from './reports.service';
import type { ReportFiltersDto } from './dto/report-filters.dto';
import { createPartialPrismaMock } from '../../test/helpers/prisma.mock';

jest.mock('./reports-orders.service', () => {
  const actual = jest.requireActual('./reports-orders.service');
  return {
    ...actual,
    dateRange: (f: { startDate?: string; endDate?: string }) => ({
      start: f.startDate ? new Date(f.startDate) : new Date(0),
      end: f.endDate ? new Date(f.endDate) : new Date(),
    }),
  };
});

describe('ReportsService', () => {
  let service: ReportsService;
  let prisma: ReturnType<typeof createPartialPrismaMock>;
  let ordersService: { getVendas: jest.Mock; [k: string]: jest.Mock };
  let affiliateService: {
    resolveAffiliateIds: jest.Mock;
    getAfiliados: jest.Mock;
    getIndicadores: jest.Mock;
    getIndicadoresProduto: jest.Mock;
  };

  beforeEach(async () => {
    prisma = createPartialPrismaMock({
      customerSubscription: ['count', 'findMany', 'groupBy'],
    });
    (prisma as Record<string, unknown>).$queryRaw = jest.fn().mockResolvedValue([]);
    prisma.customerSubscription.count.mockResolvedValue(0);
    prisma.customerSubscription.findMany.mockResolvedValue([]);
    prisma.customerSubscription.groupBy.mockResolvedValue([]);
    ordersService = {
      getVendas: jest.fn().mockResolvedValue({ rows: [] }),
      getVendasSummary: jest.fn().mockResolvedValue({ total: 0 }),
      getVendasDaily: jest.fn().mockResolvedValue([]),
      getAfterPay: jest.fn().mockResolvedValue([]),
      getAbandonos: jest.fn().mockResolvedValue([]),
      getRecusa: jest.fn().mockResolvedValue([]),
      getOrigem: jest.fn().mockResolvedValue([]),
      getEstornos: jest.fn().mockResolvedValue([]),
      getChargeback: jest.fn().mockResolvedValue([]),
    };
    affiliateService = {
      resolveAffiliateIds: jest.fn().mockResolvedValue([]),
      getAfiliados: jest.fn().mockResolvedValue([]),
      getIndicadores: jest.fn().mockResolvedValue([]),
      getIndicadoresProduto: jest.fn().mockResolvedValue([]),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsService,
        { provide: PrismaService, useValue: prisma },
        { provide: ReportsOrdersService, useValue: ordersService },
        { provide: ReportsAffiliateService, useValue: affiliateService },
      ],
    }).compile();
    service = module.get(ReportsService);
  });

  describe('delegations', () => {
    it('getVendas resolves affiliate IDs when affiliateEmail filter is set', async () => {
      affiliateService.resolveAffiliateIds.mockResolvedValue(['p1', 'p2']);
      await service.getVendas('ws-1', { affiliateEmail: 'aff@x.com' });
      expect(affiliateService.resolveAffiliateIds).toHaveBeenCalledWith('ws-1', 'aff@x.com');
      expect(ordersService.getVendas).toHaveBeenCalledWith(
        'ws-1',
        { affiliateEmail: 'aff@x.com' },
        ['p1', 'p2'],
      );
    });

    it('getVendas passes undefined affiliateIds when no affiliateEmail filter', async () => {
      await service.getVendas('ws-1', {});
      expect(ordersService.getVendas).toHaveBeenCalledWith('ws-1', {}, undefined);
    });

    it.each([
      ['getAbandonos', 'getAbandonos'],
      ['getRecusa', 'getRecusa'],
      ['getOrigem', 'getOrigem'],
      ['getEstornos', 'getEstornos'],
      ['getChargeback', 'getChargeback'],
      ['getAfterPay', 'getAfterPay'],
    ])('delegates %s to ReportsOrdersService.%s', (method, ordersMethod) => {
      void (service as Record<string, (...args: unknown[]) => unknown>)[method]?.('ws-1', {});
      expect(ordersService[ordersMethod]).toHaveBeenCalledWith('ws-1', {});
    });

    it.each([
      ['getAfiliados', 'getAfiliados'],
      ['getIndicadores', 'getIndicadores'],
      ['getIndicadoresProduto', 'getIndicadoresProduto'],
    ])('delegates %s to ReportsAffiliateService.%s', (method, affMethod) => {
      void (service as Record<string, (...args: unknown[]) => unknown>)[method]?.('ws-1', {});
      expect((affiliateService as Record<string, jest.Mock>)[affMethod]).toHaveBeenCalledWith(
        'ws-1',
        {},
      );
    });
  });

  describe('getChurn', () => {
    it('counts subscriptions with status=CANCELLED scoped to workspace', async () => {
      prisma.customerSubscription.count.mockResolvedValue(7);
      const result = await service.getChurn('ws-1', { perPage: 5, page: 1 });
      expect(result.total).toBe(7);
      const countArg = prisma.customerSubscription.count.mock.calls[0][0];
      expect(countArg.where.workspaceId).toBe('ws-1');
      expect(countArg.where.status).toBe('CANCELLED');
    });

    it('returns empty monthly array when raw query fails', async () => {
      prisma.$queryRaw.mockRejectedValue(new Error('SQL boom'));
      const result = await service.getChurn('ws-1', {});
      expect(result.monthly).toEqual([]);
    });
  });

  describe('getAssinaturas', () => {
    it('filters by status when supplied', async () => {
      await service.getAssinaturas('ws-1', { status: 'ACTIVE' });
      const findManyArg = prisma.customerSubscription.findMany.mock.calls[0][0];
      expect(findManyArg.where.status).toBe('ACTIVE');
      expect(findManyArg.where.workspaceId).toBe('ws-1');
    });

    it('caps perPage at 100', async () => {
      await service.getAssinaturas('ws-1', { perPage: 999, page: 1 });
      const findManyArg = prisma.customerSubscription.findMany.mock.calls[0][0];
      expect(findManyArg.take).toBe(100);
    });
  });

  describe('registerAdSpend', () => {
    it('rejects invalid date', async () => {
      await expect(
        service.registerAdSpend('ws-1', {
          amount: 100,
          platform: 'meta',
          date: 'not-a-date',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
