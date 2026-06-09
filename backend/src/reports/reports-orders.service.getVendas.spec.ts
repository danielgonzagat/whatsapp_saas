import { PrismaService } from '../prisma/prisma.service';
import { ReportsOrdersService } from './reports-orders.service';
import type { ReportFiltersDto } from './dto/report-filters.dto';
import { createPartialPrismaMock } from '../../test/helpers/prisma.mock';

type OrderDelegateMock = { findMany: jest.Mock; count: jest.Mock; groupBy: jest.Mock };

describe('ReportsOrdersService.getVendas', () => {
  let service: ReportsOrdersService;
  let orders: OrderDelegateMock;

  // Three orders in the report window, newest first (Prisma orderBy desc).
  // - o3 (carol): never had a PAID order → first purchase
  // - o2 (bob): earliest PAID order is o2 itself → first purchase
  // - o1 (alice): had a PAID order BEFORE the window → repeat purchase
  const o1 = { id: 'o1', customerEmail: 'alice@x.com', createdAt: new Date('2026-06-01T00:00:00Z') };
  const o2 = { id: 'o2', customerEmail: 'bob@x.com', createdAt: new Date('2026-06-02T00:00:00Z') };
  const o3 = { id: 'o3', customerEmail: 'carol@x.com', createdAt: new Date('2026-06-03T00:00:00Z') };
  const allDesc = [o3, o2, o1];
  const earliestPaid = [
    { customerEmail: 'alice@x.com', _min: { createdAt: new Date('2026-01-01T00:00:00Z') } },
    { customerEmail: 'bob@x.com', _min: { createdAt: new Date('2026-06-02T00:00:00Z') } },
  ];

  beforeEach(() => {
    const prisma = createPartialPrismaMock({
      checkoutOrder: ['findMany', 'count', 'groupBy'],
    });
    orders = prisma.checkoutOrder as unknown as OrderDelegateMock;
    service = new ReportsOrdersService(prisma as unknown as PrismaService);
  });

  describe('isFirstPurchase=true', () => {
    it('returns total = number of first purchases (filter applied BEFORE pagination), not the raw count', async () => {
      orders.findMany
        .mockResolvedValueOnce(allDesc) // unpaginated candidate fetch
        .mockResolvedValueOnce([
          { ...o3, payment: null },
          { ...o2, payment: null },
        ]); // page fetch
      orders.groupBy.mockResolvedValue(earliestPaid);

      const result = await service.getVendas('ws-1', {
        isFirstPurchase: 'true',
      } as ReportFiltersDto);

      expect(result.total).toBe(2);
      expect(result.data.map((o: { id: string }) => o.id)).toEqual(['o3', 'o2']);
      // The candidate fetch must NOT be paginated — take/skip belong after the filter.
      const candidateCall = orders.findMany.mock.calls[0][0] as Record<string, unknown>;
      expect(candidateCall.take).toBeUndefined();
      expect(candidateCall.skip).toBeUndefined();
      // total comes from the filtered list, never from an unfiltered count.
      expect(orders.count).not.toHaveBeenCalled();
    });

    it('excludes a customer whose PAID order predates the window even when they land on the first page', async () => {
      orders.findMany
        .mockResolvedValueOnce(allDesc)
        .mockResolvedValueOnce([
          { ...o3, payment: null },
          { ...o2, payment: null },
        ]);
      orders.groupBy.mockResolvedValue(earliestPaid);

      const result = await service.getVendas('ws-1', {
        isFirstPurchase: 'true',
      } as ReportFiltersDto);

      // alice (o1) had a PAID order on 2026-01-01 < o1.createdAt → not a first purchase.
      const pageCall = orders.findMany.mock.calls[1][0] as {
        where: { id: { in: string[] } };
      };
      expect(pageCall.where.id.in).toEqual(['o3', 'o2']);
      expect(result.data.map((o: { id: string }) => o.id)).not.toContain('o1');
      expect(result.total).toBe(2);
    });

    it('paginates the FILTERED list: page 2 with perPage 1 yields the second first-purchase, total stays 2', async () => {
      orders.findMany
        .mockResolvedValueOnce(allDesc)
        .mockResolvedValueOnce([{ ...o2, payment: null }]);
      orders.groupBy.mockResolvedValue(earliestPaid);

      const result = await service.getVendas('ws-1', {
        isFirstPurchase: 'true',
        page: 2,
        perPage: 1,
      } as unknown as ReportFiltersDto);

      // filtered list is [o3, o2]; page 2 (skip 1, take 1) → [o2], NOT o1.
      const pageCall = orders.findMany.mock.calls[1][0] as {
        where: { id: { in: string[] } };
      };
      expect(pageCall.where.id.in).toEqual(['o2']);
      expect(result.total).toBe(2);
      expect(result.page).toBe(2);
    });

    it('resolves first purchases with a single indexed groupBy on customerEmail (no per-order counts)', async () => {
      orders.findMany.mockResolvedValueOnce(allDesc).mockResolvedValueOnce([]);
      orders.groupBy.mockResolvedValue(earliestPaid);

      await service.getVendas('ws-1', { isFirstPurchase: 'true' } as ReportFiltersDto);

      expect(orders.groupBy).toHaveBeenCalledTimes(1);
      expect(orders.groupBy).toHaveBeenCalledWith({
        by: ['customerEmail'],
        where: {
          workspaceId: 'ws-1',
          customerEmail: { in: ['carol@x.com', 'bob@x.com', 'alice@x.com'] },
          status: 'PAID',
        },
        _min: { createdAt: true },
      });
      expect(orders.count).not.toHaveBeenCalled();
    });
  });

  describe('without isFirstPurchase', () => {
    it('keeps the original paginated findMany + count flow untouched', async () => {
      const rows = [{ ...o3, payment: null }];
      orders.findMany.mockResolvedValue(rows);
      orders.count.mockResolvedValue(42);

      const result = await service.getVendas('ws-1', {} as ReportFiltersDto);

      expect(result).toEqual({ data: rows, total: 42, page: 1 });
      expect(orders.findMany).toHaveBeenCalledTimes(1);
      expect(orders.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 10, skip: 0 }),
      );
      expect(orders.groupBy).not.toHaveBeenCalled();
    });
  });
});
