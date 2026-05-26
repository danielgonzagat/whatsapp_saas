import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { ReportsAffiliateService } from './reports-affiliate.service';
import type { ReportFiltersDto } from './dto/report-filters.dto';
import { createPartialPrismaMock } from '../../test/helpers/prisma.mock';

describe('ReportsAffiliateService', () => {
  let service: ReportsAffiliateService;
  let prisma: ReturnType<typeof createPartialPrismaMock>;

  beforeEach(async () => {
    prisma = createPartialPrismaMock({
      affiliatePartner: ['findMany'],
    });
    (prisma as Record<string, unknown>).$queryRaw = jest.fn();
    const module: TestingModule = await Test.createTestingModule({
      providers: [ReportsAffiliateService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(ReportsAffiliateService);
  });

  describe('resolveAffiliateIds', () => {
    it('returns ids matching email case-insensitively, scoped to workspace', async () => {
      prisma.affiliatePartner.findMany.mockResolvedValue([{ id: 'p1' }, { id: 'p2' }]);
      const ids = await service.resolveAffiliateIds('ws-1', 'foo@bar');
      expect(ids).toEqual(['p1', 'p2']);
      expect(prisma.affiliatePartner.findMany).toHaveBeenCalledWith({
        where: {
          workspaceId: 'ws-1',
          partnerEmail: { contains: 'foo@bar', mode: 'insensitive' },
        },
        select: { id: true },
      });
    });
  });

  describe('getAfiliados', () => {
    it('filters by active status and orders by totalRevenue desc', async () => {
      prisma.affiliatePartner.findMany.mockResolvedValue([{ id: 'p1' }]);
      const result = await service.getAfiliados('ws-1', {});
      expect(result).toEqual([{ id: 'p1' }]);
      expect(prisma.affiliatePartner.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workspaceId: 'ws-1', status: 'active' },
          orderBy: { totalRevenue: 'desc' },
          take: 50,
        }),
      );
    });

    it('returns empty array on query failure (defensive)', async () => {
      prisma.affiliatePartner.findMany.mockRejectedValue(new Error('boom'));
      await expect(service.getAfiliados('ws-1', {})).resolves.toEqual([]);
    });
  });

  describe('getIndicadores', () => {
    it('selects only commission fields, ordered by totalCommission desc', async () => {
      prisma.affiliatePartner.findMany.mockResolvedValue([{ partnerName: 'a' }]);
      await service.getIndicadores('ws-1', {});
      const callArg = prisma.affiliatePartner.findMany.mock.calls[0][0];
      expect(callArg.where).toEqual({ workspaceId: 'ws-1' });
      expect(callArg.orderBy).toEqual({ totalCommission: 'desc' });
      expect(callArg.select).toEqual(
        expect.objectContaining({
          partnerName: true,
          partnerEmail: true,
          totalSales: true,
          totalRevenue: true,
          totalCommission: true,
        }),
      );
    });
  });

  describe('getIndicadoresProduto', () => {
    it('returns empty array on $queryRaw failure', async () => {
      prisma.$queryRaw.mockRejectedValue(new Error('SQL boom'));
      const result = await service.getIndicadoresProduto('ws-1', {
        start: '2026-01-01',
        end: '2026-01-31',
      } as ReportFiltersDto);
      expect(result).toEqual([]);
    });
  });
});
